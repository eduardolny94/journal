//+------------------------------------------------------------------+
//|                                            GTFX_JournalGuard.mq5 |
//|        Global Traders FX · limites de perdida del journal en MT5 |
//+------------------------------------------------------------------+
//| Asesor Experto (EA) de gestion de riesgo. NO abre operaciones.     |
//|                                                                    |
//| Con el token del journal: lee los limites que pones en la ficha de |
//| la cuenta (perdida diaria, perdida semanal y maximo de operaciones |
//| al dia) y los aplica aqui, dentro de MetaTrader. Cambias el limite |
//| en el journal y en unos segundos lo usa. Bajar un limite se aplica |
//| al momento; subirlo o quitarlo, a partir del siguiente dia.        |
//| Sin token: usa los porcentajes de los parametros.                  |
//|                                                                    |
//| Que cuenta: lo PERDIDO en operaciones CERRADAS (beneficio +        |
//| comision + swap) del dia y de la semana del broker. El flotante no |
//| cuenta. Al tocar un limite:                                        |
//|   - las posiciones que ya tenias abiertas se QUEDAN como estan,    |
//|   - cualquier posicion NUEVA se cierra al instante,                |
//|   - las ordenes pendientes se borran,                              |
//|   - se libera sola al siguiente dia (o el lunes, si es el semanal).|
//| Guarda los ultimos limites recibidos: si se cae internet o el      |
//| journal, sigue vigilando con ellos.                                |
//| Avisa en pantalla y con notificacion al movil (MetaQuotes ID en    |
//| Herramientas -> Opciones -> Notificaciones).                       |
//|                                                                    |
//| Instalacion (Windows y Mac, igual):                                |
//|  1. MetaTrader 5: Archivo -> Abrir carpeta de datos -> MQL5 ->     |
//|     Experts, y copia ahi GTFX_JournalGuard.ex5.                    |
//|  2. Herramientas -> Opciones -> Asesores Expertos -> "Permitir     |
//|     WebRequest para las URL listadas" -> anade la URL del journal. |
//|  3. Navegador -> Asesores Expertos -> Actualizar. Arrastra         |
//|     GTFX_JournalGuard a un grafico, pega el token y deja el boton  |
//|     "Algo Trading" en verde.                                       |
//| Tiene que haber un MetaTrader de escritorio abierto en esa cuenta: |
//| si lo cierras o apagas el equipo, deja de vigilar.                 |
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "2.3"
#property strict
#property description "Aplica en MetaTrader los limites de la ficha de tu cuenta en el journal (perdida diaria, semanal y maximo de operaciones). Al tocar uno no deja abrir mas operaciones; no toca las que ya estaban abiertas."

#include <Trade/Trade.mqh>

input string Token             = "";     // Token del journal (Cuentas -> Conectar). Vacio = el que ya use otro programa GTFX de este ordenador
input string JournalUrl        = "https://journal.cesarzorrilla.com"; // Direccion del journal
input double PerdidaDiariaPct  = 1.0;    // SIN token: % de la cuenta que puedes perder al dia
input double PerdidaSemanalPct = 0;      // SIN token: % de la cuenta que puedes perder a la semana (0 = sin limite)
input int    MaxOperacionesDia = 0;      // SIN token: maximo de operaciones al dia (0 = sin limite)
input double TamanoCuenta      = 0;      // SIN token: tamano de la cuenta, 100000, 200000... (0 = saldo al empezar)
input int    AvisoPct          = 70;     // Avisarte al consumir este % de un limite
input bool   CerrarAbiertas    = false;  // Al bloquear, cerrar tambien las que ya estaban abiertas
input bool   BorrarPendientes  = true;   // Al bloquear, borrar las ordenes pendientes
input int    Segundos          = 5;      // Cada cuantos segundos se revisa

CTrade   g_trade;
double   g_limD = 0, g_limW = 0;         // limites en moneda de la cuenta (0 = sin limite)
int      g_maxN = 0;                     // maximo de operaciones al dia (0 = sin limite)
bool     g_delJournal = false;           // los limites vienen de la ficha del journal
double   g_perdD = 0, g_perdW = 0;       // perdida cerrada de hoy y de la semana (positiva = perdiendo)
int      g_ops = 0;                      // operaciones abiertas hoy
long     g_corteD = 0, g_corteW = 0, g_corteN = 0;   // ms en que se toco cada limite (0 = no)
bool     g_journal = false;              // bloqueo que viene del journal
long     g_corteJournal = 0;
string   g_motivo = "", g_hasta = "", g_cuenta = "", g_pendiente = "", g_nota = "";
int      g_fallos = 0;
long     g_diaAviso = 0;
ulong    g_ultimoCierre = 0;
string   g_token = "";                   // token en uso: el del parametro o el compartido

bool   ConJournal() { return StringLen(g_token) >= 20; }
string Gv(const string nombre) { return "GTFX_Guard_" + nombre + "_" + (string)AccountInfoInteger(ACCOUNT_LOGIN); }
double GvLeer(const string nombre) { return GlobalVariableCheck(Gv(nombre)) ? GlobalVariableGet(Gv(nombre)) : 0; }
long   DiaDe(const datetime t) { MqlDateTime s; TimeToStruct(t, s); return (long)s.year * 10000 + (long)s.mon * 100 + (long)s.day; }
long   DiaBroker() { return DiaDe(TimeTradeServer()); }
string Dinero(const double v) { return DoubleToString(MathAbs(v) < 0.005 ? 0.0 : v, 2) + " " + AccountInfoString(ACCOUNT_CURRENCY); }

//--- token compartido entre los programas GTFX de este ordenador -----
// El token unico (gtfxu_...) que el journal acepta se guarda en la carpeta comun de MetaTrader. Si este programa no tiene
// token o el suyo es rechazado, usa ese: basta con pegar el token bueno en UN solo sitio.
string LeerTokenComun()
{
   int h = FileOpen("GTFX_token.txt", FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return "";
   string t = FileReadString(h);
   FileClose(h);
   StringTrimLeft(t);
   StringTrimRight(t);
   return StringFind(t, "gtfxu_") == 0 && StringLen(t) >= 20 ? t : "";
}

void GuardarTokenComun(const string t)
{
   if(StringFind(t, "gtfxu_") != 0 || LeerTokenComun() == t) return;
   int h = FileOpen("GTFX_token.txt", FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   FileWriteString(h, t);
   FileClose(h);
}

// Devuelve true si habia un token compartido distinto y se ha adoptado.
bool AdoptarTokenComun()
{
   string c = LeerTokenComun();
   if(c == "" || c == g_token) return false;
   g_token = c;
   return true;
}

void Avisar(const string texto)
{
   Alert(texto);
   if(TerminalInfoInteger(TERMINAL_NOTIFICATIONS_ENABLED)) SendNotification(texto);
}

//--- limites recibidos del journal -----------------------------------
// Bajar un limite se aplica al momento. Subirlo o quitarlo queda pendiente hasta el siguiente dia del broker,
// para que no se pueda aflojar en caliente.
void GuardarLimite(const string clave, const string etiqueta, const double nuevo)
{
   long hoy = DiaBroker();
   bool tiene = GlobalVariableCheck(Gv("lim_" + clave));
   double actual = tiene ? GlobalVariableGet(Gv("lim_" + clave)) : 0;
   if(tiene && nuevo == actual)
   {
      if(GlobalVariableCheck(Gv("pend_" + clave))) { GlobalVariableDel(Gv("pend_" + clave)); GlobalVariableDel(Gv("penddia_" + clave)); }
      return;
   }
   bool afloja = tiene && actual > 0 && (nuevo <= 0 || nuevo > actual);
   if(afloja)
   {
      bool mismo = GlobalVariableCheck(Gv("pend_" + clave)) && GlobalVariableGet(Gv("pend_" + clave)) == nuevo;
      if(!mismo)
      {
         GlobalVariableSet(Gv("pend_" + clave), nuevo);
         GlobalVariableSet(Gv("penddia_" + clave), (double)hoy);
         Print("GTFX_JournalGuard: el limite ", etiqueta, " se ha subido en el journal (", DoubleToString(actual, 2), " -> ", DoubleToString(nuevo, 2), "). Se aplicara manana.");
      }
      if(hoy <= (long)GvLeer("penddia_" + clave))
      {
         g_pendiente += (g_pendiente == "" ? "" : ", ") + etiqueta;
         return;
      }
      GlobalVariableDel(Gv("pend_" + clave));
      GlobalVariableDel(Gv("penddia_" + clave));
   }
   GlobalVariableSet(Gv("lim_" + clave), nuevo);
   Print("GTFX_JournalGuard: limite ", etiqueta, " = ", nuevo > 0 ? DoubleToString(nuevo, 2) : "sin limite", " (ficha del journal).");
}

//--- perdidas cerradas del dia y de la semana (solo lee el historial local) ---
void Calcular()
{
   datetime ahora = TimeTradeServer();
   datetime inicioDia = ahora - (ahora % 86400);
   MqlDateTime s;
   TimeToStruct(ahora, s);
   datetime inicioSem = inicioDia - ((s.day_of_week + 6) % 7) * 86400;   // lunes 00:00 del broker
   if(!HistorySelect(inicioSem, ahora + 86400)) return;
   int n = HistoryDealsTotal();

   double todoSem = 0;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      todoSem += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_FEE);
   }
   double baseSem = AccountInfoDouble(ACCOUNT_BALANCE) - todoSem;   // saldo al empezar la semana

   g_delJournal = ConJournal() && GlobalVariableCheck(Gv("lim_d"));
   if(g_delJournal)
   {
      g_limD = GvLeer("lim_d");
      g_limW = GvLeer("lim_w");
      g_maxN = (int)GvLeer("lim_n");
   }
   else
   {
      double tam = TamanoCuenta > 0 ? TamanoCuenta : baseSem;
      g_limD = tam * PerdidaDiariaPct / 100.0;
      g_limW = tam * PerdidaSemanalPct / 100.0;
      g_maxN = MaxOperacionesDia;
   }

   double acumD = 0, acumW = 0;
   int ops = 0;
   long corteD = 0, corteW = 0, corteN = 0;
   for(int i = 0; i < n; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;   // ingresos, retiros y ajustes no cuentan
      double v = HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_FEE);
      long ms = HistoryDealGetInteger(t, DEAL_TIME_MSC);
      acumW += v;
      if(corteW == 0 && g_limW > 0 && acumW <= -g_limW) corteW = ms;
      if((datetime)HistoryDealGetInteger(t, DEAL_TIME) < inicioDia) continue;
      acumD += v;
      if(corteD == 0 && g_limD > 0 && acumD <= -g_limD) corteD = ms;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN)
      {
         ops++;
         if(corteN == 0 && g_maxN > 0 && ops >= g_maxN) corteN = ms;   // la operacion numero N se queda; la siguiente ya no
      }
   }
   g_perdD = -acumD; g_perdW = -acumW; g_ops = ops;
   g_corteD = corteD; g_corteW = corteW; g_corteN = corteN;   // una vez tocado, queda bloqueado aunque luego recuperes

   long hoy = DiaBroker(), sem = DiaDe(inicioSem);
   Anunciar("d", hoy, g_corteD > 0, "daily_loss",
            "LIMITE DEL DIA tocado (" + Dinero(g_perdD) + " de " + Dinero(g_limD) + "). Hoy no se abren mas operaciones; las que ya tenias siguen abiertas.");
   Anunciar("w", sem, g_corteW > 0, "weekly_loss",
            "LIMITE DE LA SEMANA tocado (" + Dinero(g_perdW) + " de " + Dinero(g_limW) + "). No se abren mas operaciones hasta el lunes; las que ya tenias siguen abiertas.");
   Anunciar("n", hoy, g_corteN > 0, "max_trades",
            "MAXIMO DE OPERACIONES del dia alcanzado (" + (string)g_ops + " de " + (string)g_maxN + "). Hoy no se abren mas.");
   // Lo abierto antes de que el guardian viera el bloqueo se respeta siempre: si bajas un limite por debajo de lo ya
   // perdido, o arrancas el guardian con el limite ya pasado, el corte es ese momento y no el del cierre antiguo.
   if(g_corteD > 0) g_corteD = MathMax(g_corteD, (long)GvLeer("det_d"));
   if(g_corteW > 0) g_corteW = MathMax(g_corteW, (long)GvLeer("det_w"));
   if(g_corteN > 0) g_corteN = MathMax(g_corteN, (long)GvLeer("det_n"));

   if(!BloqueoLocal() && AvisoPct > 0 && g_diaAviso != hoy)
   {
      bool cercaD = g_limD > 0 && g_perdD >= g_limD * AvisoPct / 100.0;
      bool cercaW = g_limW > 0 && g_perdW >= g_limW * AvisoPct / 100.0;
      if(cercaD || cercaW)
      {
         g_diaAviso = hoy;
         Avisar("Global Traders FX: cuidado. " + (cercaD ? "Hoy llevas " + Dinero(g_perdD) + " de " + Dinero(g_limD) + ". " : "")
                + (cercaW ? "Esta semana llevas " + Dinero(g_perdW) + " de " + Dinero(g_limW) + "." : ""));
      }
   }
}

// Avisa una sola vez por dia (o semana) de cada bloqueo, aunque se reinicie el terminal, y lo comunica al journal.
void Anunciar(const string clave, const long periodo, const bool activo, const string kind, const string texto)
{
   if(!activo) return;
   if((long)GvLeer("anun_" + clave) == periodo) return;
   GlobalVariableSet(Gv("anun_" + clave), (double)periodo);
   GlobalVariableSet(Gv("det_" + clave), (double)((long)TimeTradeServer() * 1000));   // momento en que el guardian vio el bloqueo
   Avisar("Global Traders FX: " + texto);
   NotificarJournal(kind);
}

//--- journal ---------------------------------------------------------
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
   int k = StringFind(json, "}", i);
   if(j < 0 || (k >= 0 && k < j)) j = k;
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

void NotificarJournal(const string kind)
{
   if(!ConJournal()) return;
   bool sem = kind == "weekly_loss";
   string body = "{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"server\":\"" + AccountInfoString(ACCOUNT_SERVER)
               + "\",\"kind\":\"" + kind + "\",\"loss\":" + DoubleToString(sem ? g_perdW : g_perdD, 2)
               + ",\"limit\":" + DoubleToString(kind == "max_trades" ? g_maxN : (sem ? g_limW : g_limD), 2)
               + ",\"trades\":" + (string)g_ops + "}";
   char datos[];
   StringToCharArray(body, datos, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(datos, ArraySize(datos) - 1); // sin el terminador
   char resultado[];
   string cabecerasRespuesta;
   string cabeceras = "Authorization: Bearer " + g_token + "\r\nContent-Type: application/json\r\n";
   int codigo = WebRequest("POST", JournalUrl + "/api/sync/mt5/bloquear", cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   if(codigo != 200) Print("GTFX_JournalGuard: no se pudo avisar al journal (", codigo, "). El bloqueo local sigue activo.");
}

void Consultar()
{
   if(!ConJournal() && AdoptarTokenComun()) Print("GTFX_JournalGuard: uso el token que ya tiene otro programa GTFX de este ordenador.");
   if(!ConJournal()) return;
   string url = JournalUrl + "/api/sync/mt5/estado?login=" + (string)AccountInfoInteger(ACCOUNT_LOGIN)
              + "&server=" + UrlEncode(AccountInfoString(ACCOUNT_SERVER));
   string cabeceras = "Authorization: Bearer " + g_token + "\r\n";
   char datos[];
   char resultado[];
   string cabecerasRespuesta;
   ResetLastError();
   int codigo = WebRequest("GET", url, cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   if(codigo == -1)
   {
      if(GetLastError() == 4014 && g_fallos == 0)
         Alert("GTFX_JournalGuard: MetaTrader no deja hablar con el journal. Herramientas -> Opciones -> Asesores Expertos -> \"Permitir WebRequest\" y anade " + JournalUrl);
      g_fallos++;
      return;
   }
   string respuesta = CharArrayToString(resultado, 0, -1, CP_UTF8);
   if(codigo != 200)
   {
      if(codigo == 401 && AdoptarTokenComun())
      {
         Print("GTFX_JournalGuard: el token de los parametros ya no vale; uso el que tiene otro programa GTFX de este ordenador.");
         g_fallos = 0;
         g_nota = "";
         return;
      }
      if(g_fallos == 0)
      {
         Print("GTFX_JournalGuard: respuesta del journal ", codigo, ": ", respuesta);
         g_nota = codigo == 401 ? "Token no valido: genera uno nuevo en el journal." : (codigo == 409 ? "Este token es de otra cuenta de MT5." : "El journal respondio " + (string)codigo + ".");
      }
      g_fallos++;
      return;
   }
   g_fallos = 0;
   GuardarTokenComun(g_token);
   g_nota = Extraer(respuesta, "pending");
   if(g_nota == "")
   {
      // Limites de la ficha de la cuenta. Sin la clave (journal antiguo) no se toca nada.
      if(StringFind(respuesta, "\"limit_daily\":") >= 0)
      {
         g_pendiente = "";
         GuardarLimite("d", "diario", StringToDouble(Extraer(respuesta, "limit_daily")));
         GuardarLimite("w", "semanal", StringToDouble(Extraer(respuesta, "limit_weekly")));
         GuardarLimite("n", "de operaciones", StringToDouble(Extraer(respuesta, "limit_trades")));
      }
      g_cuenta = Extraer(respuesta, "account_name");
   }
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
         if(!BloqueoLocal()) Avisar("Global Traders FX: cuenta BLOQUEADA por el journal (" + g_motivo + "). No se abren mas operaciones hasta " + g_hasta + " (UTC).");
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
bool BloqueoLocal() { return g_corteD > 0 || g_corteW > 0 || g_corteN > 0; }
bool Bloqueada()    { return BloqueoLocal() || g_journal; }

long Corte()
{
   long c = 0;
   if(g_corteD > 0) c = g_corteD;
   if(g_corteW > 0 && (c == 0 || g_corteW < c)) c = g_corteW;
   if(g_corteN > 0 && (c == 0 || g_corteN < c)) c = g_corteN;
   if(g_journal && g_corteJournal > 0 && (c == 0 || g_corteJournal < c)) c = g_corteJournal;
   return c;
}

void Aplicar()
{
   if(!Bloqueada()) return;
   if(GetTickCount64() - g_ultimoCierre < 1000) return;   // sin rafagas de peticiones al broker
   long corte = Corte();
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
   string t = "\n  GLOBAL TRADERS FX · limites de riesgo" + (g_cuenta != "" ? " · " + g_cuenta : "");
   t += "\n  Limites " + (g_delJournal ? "de la ficha del journal" : "de los parametros del EA") + ":";
   t += "\n   Dia:      " + (g_limD > 0 ? "perdido " + Dinero(MathMax(0, g_perdD)) + " de " + Dinero(g_limD) + (g_corteD > 0 ? "  << TOCADO" : " · quedan " + Dinero(g_limD - MathMax(0, g_perdD))) : "sin limite");
   t += "\n   Semana:   " + (g_limW > 0 ? "perdido " + Dinero(MathMax(0, g_perdW)) + " de " + Dinero(g_limW) + (g_corteW > 0 ? "  << TOCADO" : " · quedan " + Dinero(g_limW - MathMax(0, g_perdW))) : "sin limite");
   if(g_maxN > 0) t += "\n   Operaciones hoy: " + (string)g_ops + " de " + (string)g_maxN + (g_corteN > 0 ? "  << TOCADO" : "");
   if(Bloqueada())
   {
      t += "\n  BLOQUEADA: no se abren mas operaciones (toda posicion nueva se cierra al instante).";
      if(!CerrarAbiertas) t += "\n  Las que ya tenias abiertas siguen abiertas.";
      if(g_corteW > 0) t += "\n  Se libera el lunes.";
      else if(BloqueoLocal()) t += "\n  Se libera al empezar el siguiente dia del broker.";
      else t += "\n  Bloqueo del journal: " + g_motivo + " · hasta " + g_hasta + " (UTC).";
   }
   else t += "\n  Activo · puedes operar";
   if(g_pendiente != "") t += "\n  Cambio pendiente: el limite " + g_pendiente + " subido en el journal se aplica manana.";
   if(ConJournal())
   {
      if(g_nota != "") t += "\n  AVISO: " + g_nota;
      else if(g_token != Token && g_fallos == 0) t += "\n  Conectado con el token compartido de este ordenador.";
      else if(g_fallos > 0) t += "\n  (journal sin respuesta: sigo con los ultimos limites recibidos)";
      else if(!g_delJournal) t += "\n  Esperando los limites del journal...";
   }
   else t += "\n  Sin token: pega el token del journal para usar los limites de la ficha.";
   Comment(t);
}

void Revisar()
{
   Calcular();
   Aplicar();
   Pintar();
}

int OnInit()
{
   g_token = Token;
   StringTrimLeft(g_token);
   StringTrimRight(g_token);
   if(StringLen(Token) > 0 && !ConJournal())
      Alert("GTFX_JournalGuard: el token no parece completo.");
   if(!ConJournal()) { g_token = ""; AdoptarTokenComun(); }
   if(!ConJournal() && PerdidaDiariaPct <= 0 && PerdidaSemanalPct <= 0 && MaxOperacionesDia <= 0)
   {
      Alert("GTFX_JournalGuard: pega el token del journal o pon algun limite en los parametros.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
      Alert("GTFX_JournalGuard: activa el boton \"Algo Trading\" (en verde) o no podre cerrar las operaciones nuevas.");
   g_trade.SetAsyncMode(false);
   g_trade.SetDeviationInPoints(50);
   EventSetTimer(MathMax(2, Segundos));
   Consultar();
   Revisar();
   Print("GTFX_JournalGuard 2.3 en la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), " · limite dia ", Dinero(g_limD), " · semana ", Dinero(g_limW), " · operaciones ", (string)g_maxN);
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
