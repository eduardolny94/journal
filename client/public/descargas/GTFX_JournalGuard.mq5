//+------------------------------------------------------------------+
//|                                            GTFX_JournalGuard.mq5 |
//|                 Global Traders FX · guardián del límite de riesgo |
//+------------------------------------------------------------------+
//| Asesor Experto (EA) de gestion de riesgo. Dos vigilancias:         |
//|  1) SUELO LOCAL DE CAPITAL (no depende de internet ni del journal):|
//|     al empezar cada dia del broker guarda el mayor entre balance y |
//|     equidad; si la equidad (con el flotante) cae PerdidaDiariaUSD  |
//|     por debajo, cierra todo, borra las pendientes y no deja operar |
//|     hasta el siguiente dia del broker. Avisa al journal.           |
//|  2) BLOQUEO DEL JOURNAL: pregunta cada pocos segundos si la cuenta |
//|     esta bloqueada con bloqueo estricto (perdida diaria o semanal  |
//|     de operaciones cerradas, maximo de operaciones, bloqueo manual)|
//|     y si lo esta, cierra todo y vuelve a cerrar al instante toda   |
//|     posicion nueva hasta que el journal levante el bloqueo.        |
//| Solo cierra; nunca abre ni modifica. Manda ordenes al broker       |
//| unicamente cuando hay algo que cerrar: el resto del tiempo lee     |
//| valores que el terminal ya tiene en memoria.                       |
//| Instalacion: MetaEditor -> Nuevo -> Asesor Experto -> nombre       |
//| GTFX_JournalGuard -> pegar este codigo -> Compilar (F7). Arrastrar |
//| el EA a CUALQUIER grafico de la cuenta, activar "Permitir trading  |
//| automatizado" y, en Herramientas -> Opciones -> Asesores Expertos, |
//| "Permitir WebRequest para las URL listadas" con la URL del journal.|
//| Limite fisico: si quitas el EA, cierras MetaTrader o apagas el     |
//| AutoTrading, deja de vigilar. El journal lo registra como violacion|
//| si operas en bloqueo.                                              |
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "1.2"
#property strict
#property description "Suelo de perdida diaria por equidad + bloqueo estricto del journal: cierra todo y no deja operar."

#include <Trade/Trade.mqh>

input string JournalUrl        = "https://journal.cesarzorrilla.com"; // Direccion del journal
input string Token             = "";     // Token de sincronizacion (journal -> Conectar; el unico o el de la cuenta)
input double PerdidaDiariaUSD  = 1000.0; // Suelo local: perdida maxima del dia en moneda de la cuenta (0 = desactivado)
input int    AvisoPct          = 70;     // Avisar al consumir este % del suelo
input int    Segundos          = 5;      // Cada cuantos segundos se consulta el journal
input bool   CerrarPendientes  = true;   // Borrar tambien las ordenes pendientes en bloqueo

CTrade   g_trade;
bool     g_bloqueada = false;   // bloqueo que viene del journal
bool     g_suelo     = false;   // bloqueo local por suelo de capital
bool     g_avisado   = false;
string   g_motivo    = "";
string   g_hasta     = "";
int      g_fallos    = 0;
double   g_base      = 0;       // mayor entre balance y equidad al empezar el dia del broker
long     g_dia       = 0;       // dia del broker (aaaammdd) al que pertenece g_base

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

//--- suelo local -----------------------------------------------------
long DiaBroker()
{
   MqlDateTime t;
   TimeToStruct(TimeTradeServer(), t);
   return (long)t.year * 10000 + (long)t.mon * 100 + (long)t.day;
}

string GvBase()  { return "GTFX_Guard_base_" + (string)AccountInfoInteger(ACCOUNT_LOGIN); }
string GvDia()   { return "GTFX_Guard_dia_"  + (string)AccountInfoInteger(ACCOUNT_LOGIN); }
string GvSuelo() { return "GTFX_Guard_suelo_" + (string)AccountInfoInteger(ACCOUNT_LOGIN); }

// Al cambiar el dia del broker fija la base (y la recuerda aunque se reinicie el terminal). Levanta el suelo del dia anterior.
void ActualizarBase()
{
   long hoy = DiaBroker();
   if(g_dia == hoy) return;
   if(GlobalVariableCheck(GvDia()) && (long)GlobalVariableGet(GvDia()) == hoy && GlobalVariableCheck(GvBase()))
      g_base = GlobalVariableGet(GvBase());
   else
   {
      g_base = MathMax(AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY));
      GlobalVariableSet(GvBase(), g_base);
      GlobalVariableSet(GvDia(), (double)hoy);
   }
   g_dia = hoy;
   g_avisado = false;
   bool sueloHoy = GlobalVariableCheck(GvSuelo()) && (long)GlobalVariableGet(GvSuelo()) == hoy;
   if(g_suelo && !sueloHoy) Print("GTFX_JournalGuard: nuevo dia del broker, suelo levantado.");
   g_suelo = sueloHoy;
}

void NotificarJournal()
{
   string body = "{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\",\"server\":\"" + AccountInfoString(ACCOUNT_SERVER)
               + "\",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)
               + ",\"base\":" + DoubleToString(g_base, 2)
               + ",\"limit\":" + DoubleToString(PerdidaDiariaUSD, 2)
               + ",\"floating\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + "}";
   char datos[];
   StringToCharArray(body, datos, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(datos, ArraySize(datos) - 1); // sin el terminador
   char resultado[];
   string cabecerasRespuesta;
   string cabeceras = "Authorization: Bearer " + Token + "\r\nContent-Type: application/json\r\n";
   int codigo = WebRequest("POST", JournalUrl + "/api/sync/mt5/bloquear", cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   if(codigo != 200) Print("GTFX_JournalGuard: no se pudo avisar al journal del suelo (", codigo, ")."); else Print("GTFX_JournalGuard: suelo comunicado al journal.");
}

void VigilarSuelo()
{
   if(PerdidaDiariaUSD <= 0) return;
   ActualizarBase();
   if(g_suelo) return;
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double perdida = g_base - eq;
   if(perdida >= PerdidaDiariaUSD)
   {
      g_suelo = true;
      GlobalVariableSet(GvSuelo(), (double)g_dia);
      Alert("Global Traders FX: SUELO DEL DIA tocado (", DoubleToString(perdida, 2), " de ", DoubleToString(PerdidaDiariaUSD, 2),
            " ", AccountInfoString(ACCOUNT_CURRENCY), "). Se cierra todo y no se opera hasta el siguiente dia del broker.");
      CerrarTodo();
      NotificarJournal();
      return;
   }
   if(!g_avisado && AvisoPct > 0 && perdida >= PerdidaDiariaUSD * AvisoPct / 100.0)
   {
      g_avisado = true;
      Alert("Global Traders FX: llevas ", DoubleToString(perdida, 2), " de ", DoubleToString(PerdidaDiariaUSD, 2),
            " ", AccountInfoString(ACCOUNT_CURRENCY), " de perdida hoy (", AvisoPct, " %). Quedan ", DoubleToString(PerdidaDiariaUSD - perdida, 2), ".");
   }
}

bool Bloqueada() { return g_bloqueada || g_suelo; }

//--- journal ---------------------------------------------------------
bool Consultar()
{
   // Con el token unico del usuario el journal necesita saber de que cuenta de MT5 se trata.
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
         Alert("GTFX_JournalGuard: MetaTrader no permite la conexion. Herramientas -> Opciones -> Asesores Expertos -> \"Permitir WebRequest\" y anade " + JournalUrl);
      g_fallos++;
      return false;
   }
   string respuesta = CharArrayToString(resultado, 0, -1, CP_UTF8);
   if(codigo != 200)
   {
      if(g_fallos == 0) Print("GTFX_JournalGuard: respuesta ", codigo, ": ", respuesta);
      g_fallos++;
      return false;
   }
   g_fallos = 0;
   bool bloqueada = StringFind(respuesta, "\"action\":\"cerrar_todo\"") >= 0;
   g_motivo = Motivo(Extraer(respuesta, "lock_reason"));
   g_hasta  = Extraer(respuesta, "lock_until");
   if(bloqueada && !g_bloqueada)
      Alert("Global Traders FX: cuenta BLOQUEADA por tu limite (" + g_motivo + "). Se cierran las posiciones y no se puede operar hasta " + g_hasta + " (UTC).");
   if(!bloqueada && g_bloqueada)
      Print("GTFX_JournalGuard: bloqueo levantado por el journal.");
   g_bloqueada = bloqueada;
   return true;
}

void CerrarTodo()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && !g_trade.PositionClose(ticket))
         Print("GTFX_JournalGuard: no se pudo cerrar la posicion ", ticket, ": ", g_trade.ResultRetcodeDescription());
   }
   if(CerrarPendientes)
      for(int i = OrdersTotal() - 1; i >= 0; i--)
      {
         ulong ticket = OrderGetTicket(i);
         if(ticket > 0) g_trade.OrderDelete(ticket);
      }
}

void Pintar()
{
   string moneda = AccountInfoString(ACCOUNT_CURRENCY);
   if(g_suelo)
      Comment("\n  GLOBAL TRADERS FX · CUENTA BLOQUEADA (suelo del dia)\n  Perdida del dia: ", DoubleToString(g_base - AccountInfoDouble(ACCOUNT_EQUITY), 2), " ", moneda,
              " de ", DoubleToString(PerdidaDiariaUSD, 2), "\n  Se libera con el siguiente dia del broker.\n  Toda posicion nueva se cierra al instante.");
   else if(g_bloqueada)
      Comment("\n  GLOBAL TRADERS FX · CUENTA BLOQUEADA (journal)\n  Motivo: ", g_motivo, "\n  Hasta: ", g_hasta, " (UTC)\n  Toda posicion nueva se cierra al instante.");
   else
   {
      string suelo = PerdidaDiariaUSD > 0
         ? "\n  Suelo del dia: " + DoubleToString(PerdidaDiariaUSD, 2) + " " + moneda + " · usado " + DoubleToString(MathMax(0, g_base - AccountInfoDouble(ACCOUNT_EQUITY)), 2)
           + " · base " + DoubleToString(g_base, 2)
         : "\n  Suelo del dia: desactivado";
      Comment("\n  GLOBAL TRADERS FX · guardian activo · cuenta operable", suelo, g_fallos > 0 ? "\n  (sin respuesta del journal, reintentando)" : "");
   }
}

int OnInit()
{
   if(StringLen(Token) < 20)
   {
      Alert("GTFX_JournalGuard: falta el token. Generalo en el journal (Cuentas -> Sincronizar) y pegalo en los parametros del EA.");
      return INIT_FAILED;
   }
   g_trade.SetAsyncMode(false);
   g_trade.SetDeviationInPoints(50);
   EventSetTimer(MathMax(2, Segundos));
   ActualizarBase();
   Consultar();
   VigilarSuelo();
   if(Bloqueada()) CerrarTodo();
   Pintar();
   Print("GTFX_JournalGuard: iniciado en la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), " · base del dia ", DoubleToString(g_base, 2), " · suelo ", DoubleToString(PerdidaDiariaUSD, 2));
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
   VigilarSuelo();
   if(Bloqueada()) CerrarTodo();
   Pintar();
}

void OnTick()
{
   VigilarSuelo();
   if(Bloqueada()) CerrarTodo();
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      VigilarSuelo();
      if(Bloqueada()) CerrarTodo();
   }
}
//+------------------------------------------------------------------+
