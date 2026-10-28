//+------------------------------------------------------------------+
//|                                            GTFX_JournalGuard.mq5 |
//|                 Global Traders FX · guardián del límite de riesgo |
//+------------------------------------------------------------------+
//| Asesor Experto (EA). Pregunta al journal cada pocos segundos si la |
//| cuenta esta bloqueada con bloqueo estricto. Si lo esta:            |
//|   - cierra TODAS las posiciones abiertas y borra las pendientes,   |
//|   - vuelve a cerrar al instante cualquier posicion nueva (OnTick y |
//|     OnTradeTransaction), hasta que el journal levante el bloqueo,  |
//|   - lo muestra en el grafico y avisa con Alert.                    |
//| Instalacion: MetaEditor -> Nuevo -> Asesor Experto -> nombre       |
//| GTFX_JournalGuard -> pegar este codigo -> Compilar (F7). Arrastrar |
//| el EA a CUALQUIER grafico de la cuenta, activar "Permitir trading  |
//| automatizado" y, en Herramientas -> Opciones -> Asesores Expertos, |
//| "Permitir WebRequest para las URL listadas" con la URL del journal.|
//| Limite fisico: si quitas el EA o apagas el AutoTrading, deja de    |
//| vigilar. El journal lo registra como violacion si operas en bloqueo|
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "1.1"
#property strict
#property description "Cierra todo y no deja operar mientras el journal tenga la cuenta en bloqueo estricto."

#include <Trade/Trade.mqh>

input string JournalUrl       = "https://journal.cesarzorrilla.com"; // Direccion del journal
input string Token            = "";   // Token de sincronizacion (journal -> Conectar; el unico o el de la cuenta)
input int    Segundos         = 5;    // Cada cuantos segundos se consulta el journal
input bool   CerrarPendientes = true; // Borrar tambien las ordenes pendientes en bloqueo

CTrade   g_trade;
bool     g_bloqueada = false;
string   g_motivo    = "";
string   g_hasta     = "";
int      g_fallos    = 0;

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
   if(g_bloqueada)
      Comment("\n  GLOBAL TRADERS FX · CUENTA BLOQUEADA\n  Motivo: ", g_motivo, "\n  Hasta: ", g_hasta, " (UTC)\n  Toda posicion nueva se cierra al instante.");
   else
      Comment("\n  GLOBAL TRADERS FX · guardian activo · cuenta operable", g_fallos > 0 ? "\n  (sin respuesta del journal, reintentando)" : "");
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
   Consultar();
   if(g_bloqueada) CerrarTodo();
   Pintar();
   Print("GTFX_JournalGuard: iniciado en la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), ".");
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
   if(g_bloqueada) CerrarTodo();
   Pintar();
}

void OnTick()
{
   if(g_bloqueada) CerrarTodo();
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(g_bloqueada && trans.type == TRADE_TRANSACTION_DEAL_ADD) CerrarTodo();
}
//+------------------------------------------------------------------+
