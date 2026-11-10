//+------------------------------------------------------------------+
//|                                            GTFX_JournalGuard.mq5 |
//|              Global Traders FX · limite de perdida diaria en MT5 |
//+------------------------------------------------------------------+
//| Asesor Experto (EA) de gestion de riesgo. NO abre operaciones.     |
//|                                                                    |
//| Que hace: suma lo que has PERDIDO HOY en operaciones CERRADAS      |
//| (beneficio + comision + swap; el flotante no cuenta). Cuando esa   |
//| perdida llega al X % de la cuenta, el dia queda bloqueado:         |
//|   - las posiciones que ya tenias abiertas se QUEDAN como estan,    |
//|   - cualquier posicion NUEVA se cierra al instante,                |
//|   - las ordenes pendientes se borran,                              |
//|   - se libera sola al empezar el siguiente dia del broker.         |
//| Avisa en pantalla y con una notificacion al movil (si tienes el    |
//| MetaQuotes ID puesto en Herramientas -> Opciones -> Notificaciones)|
//|                                                                    |
//| Funciona solo, sin internet ni cuenta en el journal. Si ademas     |
//| pegas el token del journal, respeta tambien sus bloqueos (perdida  |
//| semanal, maximo de operaciones, bloqueo manual) y deja registrado  |
//| el bloqueo en la ficha de la cuenta.                               |
//|                                                                    |
//| Instalacion (Windows y Mac, igual):                                |
//|  1. En MetaTrader 5: Archivo -> Abrir carpeta de datos.            |
//|  2. Entra en MQL5 -> Experts y copia ahi GTFX_JournalGuard.ex5.    |
//|  3. Navegador -> Asesores Expertos -> clic derecho -> Actualizar.  |
//|  4. Arrastra GTFX_JournalGuard a cualquier grafico, ajusta el % y  |
//|     deja el boton "Algo Trading" en verde.                         |
//| Tiene que haber un MetaTrader de escritorio abierto en esa cuenta: |
//| si lo cierras o apagas el equipo, deja de vigilar.                 |
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "2.0"
#property strict
#property description "Limite de perdida diaria (operaciones cerradas): al tocarlo no deja abrir mas operaciones hasta el dia siguiente. No toca las que ya estaban abiertas."

#include <Trade/Trade.mqh>

input double PerdidaDiariaPct  = 1.0;    // % de la cuenta que puedes perder al dia (operaciones cerradas)
input double TamanoCuenta      = 0;      // Tamano de la cuenta: 100000, 200000... (0 = saldo al empezar el dia)
input int    AvisoPct          = 70;     // Avisarte al consumir este % del limite
input bool   CerrarAbiertas    = false;  // Al bloquear, cerrar tambien las que ya estaban abiertas
input bool   BorrarPendientes  = true;   // Al bloquear, borrar las ordenes pendientes
input string Token             = "";     // (Opcional) token del journal: Cuentas -> Conectar
input string JournalUrl        = "https://journal.cesarzorrilla.com"; // (Opcional) direccion del journal
input int    Segundos          = 5;      // Cada cuantos segundos se revisa

CTrade   g_trade;
double   g_limite      = 0;      // perdida maxima del dia en moneda de la cuenta
double   g_base        = 0;      // saldo al empezar el dia del broker
double   g_perdida     = 0;      // perdida cerrada de hoy (positiva = perdiendo)
long     g_corteLocal  = 0;      // ms del cierre que toco el limite (0 = sin bloqueo local)
bool     g_journal     = false;  // bloqueo que viene del journal
long     g_corteJournal= 0;      // ms en que se vio el bloqueo del journal
string   g_motivo      = "";
string   g_hasta       = "";
int      g_fallos      = 0;
long     g_diaAviso    = 0;      // dia en que ya se dio el aviso del AvisoPct
long     g_diaBloqueo  = 0;      // dia en que ya se anuncio el bloqueo
ulong    g_ultimoCierre= 0;      // freno: como mucho un intento de cierre por segundo

bool   ConJournal() { return StringLen(Token) >= 20; }
string Gv(const string nombre) { return "GTFX_Guard_" + nombre + "_" + (string)AccountInfoInteger(ACCOUNT_LOGIN); }
long   DiaBroker()  { MqlDateTime t; TimeToStruct(TimeTradeServer(), t); return (long)t.year * 10000 + (long)t.mon * 100 + (long)t.day; }
string Dinero(const double v) { return DoubleToString(v, 2) + " " + AccountInfoString(ACCOUNT_CURRENCY); }

void Avisar(const string texto)
{
   Alert(texto);
   if(TerminalInfoInteger(TERMINAL_NOTIFICATIONS_ENABLED)) SendNotification(texto);
}

//--- perdida cerrada del dia (solo lee el historial que el terminal ya tiene) ---
void CalcularDia()
{
   datetime ahora  = TimeTradeServer();
   datetime inicio = ahora - (ahora % 86400);
   if(!HistorySelect(inicio, ahora + 86400)) return;
   int n = HistoryDealsTotal();
   double todo = 0;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      todo += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_FEE);
   }
   g_base   = AccountInfoDouble(ACCOUNT_BALANCE) - todo;
   g_limite = (TamanoCuenta > 0 ? TamanoCuenta : g_base) * PerdidaDiariaPct / 100.0;
   double acum = 0;
   long corte = 0;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;   // ingresos, retiros y ajustes no cuentan
      acum += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_FEE);
      if(corte == 0 && g_limite > 0 && acum <= -g_limite) corte = HistoryDealGetInteger(t, DEAL_TIME_MSC);
   }
   g_perdida    = -acum;
   g_corteLocal = corte;   // una vez tocado, el dia queda bloqueado aunque luego recuperes

   long hoy = DiaBroker();
   if(g_corteLocal > 0 && g_diaBloqueo != hoy)
   {
      g_diaBloqueo = hoy;
      bool nuevo = !(GlobalVariableCheck(Gv("bloqueo")) && (long)GlobalVariableGet(Gv("bloqueo")) == hoy);
      GlobalVariableSet(Gv("bloqueo"), (double)hoy);
      if(nuevo)
      {
         Avisar("Global Traders FX: LIMITE DEL DIA tocado (" + Dinero(g_perdida) + " de " + Dinero(g_limite) + "). Hoy no se abren mas operaciones; las que ya tenias siguen abiertas.");
         NotificarJournal();
      }
   }
   else if(g_corteLocal == 0 && g_limite > 0 && AvisoPct > 0 && g_diaAviso != hoy && g_perdida >= g_limite * AvisoPct / 100.0)
   {
      g_diaAviso = hoy;
      Avisar("Global Traders FX: llevas " + Dinero(g_perdida) + " perdidos hoy de " + Dinero(g_limite) + ". Te quedan " + Dinero(g_limite - g_perdida) + ".");
   }
}

//--- journal (opcional) ----------------------------------------------
string Extraer(const string json, const string clave)
{
   int i = StringFind(json, "\"" + clave + "\":");
   if(i < 0) return "";
   i += StringLen(clave) + 3;
   if(StringGetCharacter(json, i) == '"')
   {
      int j = StringFind(json, "\"", i + 1);
      return j > i ? StringSubstr(json, i + 1, j - i - 1) : "";
   }
   int j = StringFind(json, ",", i);
   if(j < 0) j = StringFind(json, "}", i);
   return j > i ? StringSubstr(json, i, j - i) : "";
}

string Motivo(const string clave)
{
   if(clave == "daily_loss")  return "perdida maxima diaria";
   if(clave == "weekly_loss") return "perdida maxima semanal";
   if(clave == "max_trades")  return "maximo de operaciones del dia";
   if(clave == "manual")      return "bloqueo manual";
   return clave;
}

string UrlEncode(const string texto)
{
   string salida = "";
   for(int i = 0; i < StringLen(texto); i++)
   {
      ushort c = StringGetCharacter(texto, i);
      if((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '-' || c == '_' || c == '.')
         salida += ShortToString(c);
      else
         salida += StringFormat("%%%02X", c & 0xFF);
   }
   return salida;
}

void NotificarJournal()
{
   if(!ConJournal()) return;
   string body = "{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"server\":\"" + AccountInfoString(ACCOUNT_SERVER)
               + "\",\"loss\":" + DoubleToString(g_perdida, 2) + ",\"limit\":" + DoubleToString(g_limite, 2)
               + ",\"base\":" + DoubleToString(g_base, 2) + "}";
   char datos[];
   StringToCharArray(body, datos, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(datos, ArraySize(datos) - 1); // sin el terminador
   char resultado[];
   string cabecerasRespuesta;
   string cabeceras = "Authorization: Bearer " + Token + "\r\nContent-Type: application/json\r\n";
   int codigo = WebRequest("POST", JournalUrl + "/api/sync/mt5/bloquear", cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   if(codigo != 200) Print("GTFX_JournalGuard: no se pudo avisar al journal (", codigo, "). El bloqueo local sigue activo.");
}

void Consultar()
{
   if(!ConJournal()) return;
   string url = JournalUrl + "/api/sync/mt5/estado?login=" + (string)AccountInfoInteger(ACCOUNT_LOGIN)
              + "&server=" + UrlEncode(AccountInfoString(ACCOUNT_SERVER));
   string cabeceras = "Authorization: Bearer " + Token + "\r\n";
   char datos[];
   char resultado[];
   string cabecerasRespuesta;
   ResetLastError();
   int codigo = WebRequest("GET", url, cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   if(codigo == -1)
   {
      if(GetLastError() == 4014 && g_fallos == 0)
         Alert("GTFX_JournalGuard: para hablar con el journal, Herramientas -> Opciones -> Asesores Expertos -> \"Permitir WebRequest\" y anade " + JournalUrl + ". El limite local funciona igual sin esto.");
      g_fallos++;
      return;
   }
   string respuesta = CharArrayToString(resultado, 0, -1, CP_UTF8);
   if(codigo != 200)
   {
      if(g_fallos == 0) Print("GTFX_JournalGuard: respuesta del journal ", codigo, ": ", respuesta);
      g_fallos++;
      return;
   }
   g_fallos = 0;
   bool bloqueada = StringFind(respuesta, "\"action\":\"cerrar_todo\"") >= 0;
   g_motivo = Motivo(Extraer(respuesta, "lock_reason"));
   g_hasta  = Extraer(respuesta, "lock_until");
   if(bloqueada && !g_journal)
   {
      // El momento del bloqueo se recuerda aunque se reinicie el terminal: lo abierto antes se respeta.
      if(GlobalVariableCheck(Gv("journal"))) g_corteJournal = (long)GlobalVariableGet(Gv("journal"));
      else
      {
         g_corteJournal = (long)TimeTradeServer() * 1000;
         GlobalVariableSet(Gv("journal"), (double)g_corteJournal);
         Avisar("Global Traders FX: cuenta BLOQUEADA por el journal (" + g_motivo + "). No se abren mas operaciones hasta " + g_hasta + " (UTC).");
      }
   }
   if(!bloqueada)
   {
      if(GlobalVariableCheck(Gv("journal"))) GlobalVariableDel(Gv("journal"));   // no arrastrar la hora de un bloqueo ya pasado
      g_corteJournal = 0;
      if(g_journal) Print("GTFX_JournalGuard: bloqueo del journal levantado.");
   }
   g_journal = bloqueada;
}

//--- aplicar el bloqueo ----------------------------------------------
bool Bloqueada() { return g_corteLocal > 0 || g_journal; }

void Aplicar()
{
   if(!Bloqueada()) return;
   if(GetTickCount64() - g_ultimoCierre < 1000) return;   // sin rafagas de peticiones al broker
   long corte = g_corteLocal;
   if(g_journal && (corte == 0 || g_corteJournal < corte)) corte = g_corteJournal;
   bool hecho = false;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!CerrarAbiertas && PositionGetInteger(POSITION_TIME_MSC) <= corte) continue;   // ya estaba abierta: se queda
      hecho = true;
      if(!g_trade.PositionClose(ticket))
         Print("GTFX_JournalGuard: no se pudo cerrar la posicion ", ticket, ": ", g_trade.ResultRetcodeDescription());
   }
   if(BorrarPendientes)
      for(int i = OrdersTotal() - 1; i >= 0; i--)
      {
         ulong ticket = OrderGetTicket(i);
         if(ticket > 0) { hecho = true; g_trade.OrderDelete(ticket); }
      }
   if(hecho) g_ultimoCierre = GetTickCount64();
}

void Pintar()
{
   string cab = "\n  GLOBAL TRADERS FX · limite de perdida diaria";
   string lim = "\n  Limite: " + Dinero(g_limite) + " (" + DoubleToString(PerdidaDiariaPct, 2) + " % de " + DoubleToString(TamanoCuenta > 0 ? TamanoCuenta : g_base, 0) + ")";
   if(g_corteLocal > 0)
      Comment(cab, "\n  BLOQUEADA HOY · perdido " + Dinero(g_perdida), lim,
              "\n  No se abren mas operaciones: toda posicion nueva se cierra al instante.",
              CerrarAbiertas ? "" : "\n  Las que ya tenias abiertas siguen abiertas.",
              "\n  Se libera sola al empezar el siguiente dia del broker.");
   else if(g_journal)
      Comment(cab, "\n  BLOQUEADA POR EL JOURNAL · " + g_motivo + " · hasta " + g_hasta + " (UTC)",
              "\n  No se abren mas operaciones: toda posicion nueva se cierra al instante.");
   else
      Comment(cab, "\n  Activo · puedes operar", lim,
              "\n  Perdido hoy (cerradas): " + Dinero(MathMax(0, g_perdida)) + " · te quedan " + Dinero(g_limite - MathMax(0, g_perdida)),
              ConJournal() ? (g_fallos > 0 ? "\n  (journal sin respuesta: el limite local sigue vigilando)" : "\n  Conectado al journal") : "");
}

void Revisar()
{
   CalcularDia();
   Aplicar();
   Pintar();
}

int OnInit()
{
   if(PerdidaDiariaPct <= 0)
   {
      Alert("GTFX_JournalGuard: pon un % de perdida diaria mayor que 0.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringLen(Token) > 0 && !ConJournal())
      Alert("GTFX_JournalGuard: el token no parece completo. Sigo solo con el limite local.");
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
      Alert("GTFX_JournalGuard: activa el boton \"Algo Trading\" (en verde) o no podre cerrar las operaciones nuevas.");
   g_trade.SetAsyncMode(false);
   g_trade.SetDeviationInPoints(50);
   EventSetTimer(MathMax(2, Segundos));
   Consultar();
   Revisar();
   Print("GTFX_JournalGuard 2.0 en la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), " · limite ", Dinero(g_limite), " · perdido hoy ", Dinero(MathMax(0, g_perdida)));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

void OnTimer()
{
   Consultar();
   Revisar();
}

void OnTick()
{
   Aplicar();
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) Revisar();
}
//+------------------------------------------------------------------+
