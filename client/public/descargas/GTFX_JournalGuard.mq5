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
//| PANEL "ABRIR CON RIESGO FIJO": pulsas Preparar, arrastras la linea |
//| roja al stop y el panel calcula los lotes para arriesgar tu % de la|
//| cuenta. Abre UNA posicion con el stop y el TP final en el broker;  |
//| el TP1 lo gestiona el programa (cierra una parte y mueve el stop a |
//| la entrada). Todo se configura en el panel o en los parametros.    |
//|                                                                    |
//| SENALES A DISCORD (opcional): con "SenalesDiscord" activado, cada  |
//| operacion que abras en la cuenta se publica sola en tu canal, con  |
//| entrada, SL, TP1 y TP2, y luego avisa de TP1, TP final o stop.     |
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
#property version   "3.1"
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

input group  "Panel: abrir operaciones con riesgo fijo"
input bool   PanelActivo       = true;   // Mostrar el panel en este grafico
input double RiesgoPct         = 0.5;    // % de la cuenta que arriesgas por operacion
input double TP1_R             = 1.0;    // TP1 a cuantas veces el stop (R). 0 = sin TP1
input double TP2_R             = 2.0;    // TP2 (objetivo final) a cuantas veces el stop (R). 0 = sin TP final
input int    PctEnTP1          = 50;     // % de la posicion que se cierra en TP1
input bool   StopAEntrada      = true;   // Al tocar TP1, mover el stop al precio de entrada
input bool   ConfirmarAbrir    = true;   // Pedir confirmacion antes de enviar la orden

input group  "Senales a Discord (automaticas al abrir una operacion)"
input bool   SenalesDiscord    = false;  // Publicar en Discord cada operacion que abras en esta cuenta
input double SenalTP1_R        = 1.0;    // TP1 a cuantas veces el stop (0 = no anunciar TP1)
input int    SenalEsperaSeg    = 45;     // Segundos de espera a que pongas el TP antes de publicar
input string SenalCerca        = "(o cercano)";         // Texto junto al precio de entrada
input string SenalPie          = "Gestiona tu riesgo";  // Ultima linea de la senal (vacio = sin ella)

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
// Panel
#define P "GTFXP_"
#define MAGIA 26111101
double   g_pRiesgo = 0, g_pR1 = 0, g_pR2 = 0;
int      g_pPct = 0;
bool     g_pBE = true, g_pListo = false, g_prep = false;
double   g_slPrecio = 0;
string   g_prepSim = "";
ulong    g_prepMs = 0, g_ultimoTP1 = 0;
// Senales a Discord
string   g_webhook = "";
ulong    g_ultDiscord = 0, g_discordHasta = 0;
bool     g_avisoDiscord = false;
datetime g_senalDesde = 0;

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
         g_nota = codigo == 401 ? "Token no valido. Pega aqui el ULTIMO que generaste (cada token nuevo anula el anterior); no generes otro." : (codigo == 409 ? "Este token es de otra cuenta de MT5." : "El journal respondio " + (string)codigo + ".");
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
      g_trade.SetTypeFillingBySymbol(PositionGetString(POSITION_SYMBOL));
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
   if(SenalesDiscord) t += "\n  Senales a Discord: ACTIVAS (se publica cada operacion nueva con stop)";
   Comment(t);
}

//====================================================================
// PANEL: abrir operaciones con riesgo fijo (tipo "position sizer")
// Arrastras la linea roja del STOP; el panel calcula los lotes para que, si salta el stop, pierdas tu % de la cuenta.
// Abre UNA sola posicion con el stop y el TP final (TP2) puestos en el broker. El TP1 lo gestiona este programa: al
// tocarlo cierra la parte indicada y, si quieres, mueve el stop a la entrada (una modificacion por operacion).
//====================================================================
void PObj(const string n, const ENUM_OBJECT tipo, const int x, const int y, const int w, const int h)
{
   string nombre = P + n;
   if(ObjectFind(0, nombre) < 0) ObjectCreate(0, nombre, tipo, 0, 0, 0);
   ObjectSetInteger(0, nombre, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, nombre, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, nombre, OBJPROP_YDISTANCE, y);
   if(w > 0) ObjectSetInteger(0, nombre, OBJPROP_XSIZE, w);
   if(h > 0) ObjectSetInteger(0, nombre, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, nombre, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, nombre, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, nombre, OBJPROP_BACK, false);
   ObjectSetInteger(0, nombre, OBJPROP_ZORDER, 10);
}

void PTexto(const string n, const int x, const int y, const string txt, const color c = clrSilver, const int tam = 9)
{
   PObj(n, OBJ_LABEL, x, y, 0, 0);
   ObjectSetString(0, P + n, OBJPROP_TEXT, txt);
   ObjectSetString(0, P + n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, P + n, OBJPROP_FONTSIZE, tam);
   ObjectSetInteger(0, P + n, OBJPROP_COLOR, c);
}

void PBoton(const string n, const int x, const int y, const int w, const int h, const string txt, const color fondo, const color tinta = clrWhite)
{
   PObj(n, OBJ_BUTTON, x, y, w, h);
   ObjectSetString(0, P + n, OBJPROP_TEXT, txt);
   ObjectSetString(0, P + n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, P + n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, P + n, OBJPROP_COLOR, tinta);
   ObjectSetInteger(0, P + n, OBJPROP_BGCOLOR, fondo);
   ObjectSetInteger(0, P + n, OBJPROP_BORDER_COLOR, C'70,70,70');
   ObjectSetInteger(0, P + n, OBJPROP_STATE, false);
}

void PCampo(const string n, const int x, const int y, const int w, const string txt)
{
   PObj(n, OBJ_EDIT, x, y, w, 20);
   ObjectSetString(0, P + n, OBJPROP_TEXT, txt);
   ObjectSetString(0, P + n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, P + n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, P + n, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, P + n, OBJPROP_BGCOLOR, C'40,40,40');
   ObjectSetInteger(0, P + n, OBJPROP_BORDER_COLOR, C'90,90,90');
   ObjectSetInteger(0, P + n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, P + n, OBJPROP_READONLY, false);
}

void PLinea(const string n, const double precio, const color c, const bool arrastrable, const ENUM_LINE_STYLE estilo, const string txt)
{
   string nombre = P + n;
   if(ObjectFind(0, nombre) < 0) ObjectCreate(0, nombre, OBJ_HLINE, 0, 0, precio);
   ObjectSetDouble(0, nombre, OBJPROP_PRICE, precio);
   ObjectSetInteger(0, nombre, OBJPROP_COLOR, c);
   ObjectSetInteger(0, nombre, OBJPROP_WIDTH, arrastrable ? 2 : 1);
   ObjectSetInteger(0, nombre, OBJPROP_STYLE, estilo);
   ObjectSetInteger(0, nombre, OBJPROP_SELECTABLE, arrastrable);
   ObjectSetInteger(0, nombre, OBJPROP_SELECTED, arrastrable);
   ObjectSetInteger(0, nombre, OBJPROP_BACK, false);
   ObjectSetString(0, nombre, OBJPROP_TEXT, txt);
   ObjectSetString(0, nombre, OBJPROP_TOOLTIP, txt);
}

double PLeer(const string n, const double defecto)
{
   string t = ObjectGetString(0, P + n, OBJPROP_TEXT);
   StringReplace(t, ",", ".");
   StringReplace(t, "%", "");
   double v = StringToDouble(t);
   return v >= 0 && MathIsValidNumber(v) ? v : defecto;
}

bool ParcialActiva() { return g_pPct > 0 && g_pPct < 100 && g_pR1 > 0 && (g_pR2 <= 0 || g_pR1 < g_pR2); }

void PanelCrear()
{
   if(!PanelActivo) return;
   int x = 8, y = 215;
   PObj("fondo", OBJ_RECTANGLE_LABEL, x, y, 268, 196);
   ObjectSetInteger(0, P + "fondo", OBJPROP_BGCOLOR, C'24,24,24');
   ObjectSetInteger(0, P + "fondo", OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, P + "fondo", OBJPROP_COLOR, C'70,70,70');
   ObjectSetInteger(0, P + "fondo", OBJPROP_ZORDER, 5);
   PTexto("titulo", x + 8, y + 6, "ABRIR CON RIESGO FIJO", clrWhite, 9);
   PTexto("l1", x + 8,  y + 30, "Riesgo por operacion %");   PCampo("riesgo", x + 196, y + 27, 62, DoubleToString(g_pRiesgo, 2));
   PTexto("l2", x + 8,  y + 54, "TP1 a (veces el stop)");    PCampo("r1",     x + 196, y + 51, 62, DoubleToString(g_pR1, 2));
   PTexto("l3", x + 8,  y + 78, "TP2 final a (veces el stop)"); PCampo("r2",  x + 196, y + 75, 62, DoubleToString(g_pR2, 2));
   PTexto("l4", x + 8,  y + 102, "% que se cierra en TP1");  PCampo("pct",    x + 196, y + 99, 62, (string)g_pPct);
   PBoton("be", x + 8, y + 123, 250, 20, "", C'50,50,50');
   PBoton("abrir", x + 8, y + 147, 170, 24, "", C'30,90,160');
   PBoton("cancelar", x + 182, y + 147, 76, 24, "Cancelar", C'70,70,70');
   PTexto("info1", x + 8, y + 175, "", clrSilver, 8);
   PTexto("info2", x + 8, y + 186, "", clrSilver, 8);
   g_pListo = true;
   PanelActualizar();
}

void PanelBorrar() { ObjectsDeleteAll(0, P); g_pListo = false; }

// Plan de la operacion segun la linea del stop. dir: +1 compra, -1 venta.
bool PlanOperacion(int &dir, double &entrada, double &sl, double &tp1, double &tp2, double &lotes, double &riesgo, string &msg)
{
   dir = 0; entrada = 0; tp1 = 0; tp2 = 0; lotes = 0; riesgo = 0; msg = "";
   sl = ObjectGetDouble(0, P + "sl", OBJPROP_PRICE);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(sl <= 0 || bid <= 0 || ask <= 0) { msg = "Sin precios todavia"; return false; }
   if(sl < bid)      { dir = 1;  entrada = ask; }
   else if(sl > ask) { dir = -1; entrada = bid; }
   else { msg = "El stop esta dentro del spread"; return false; }
   sl = NormalizeDouble(sl, _Digits);
   double dist = MathAbs(entrada - sl);
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(dist <= minDist || dist <= (ask - bid)) { msg = "Stop demasiado cerca del precio"; return false; }
   if(g_pR1 > 0) tp1 = NormalizeDouble(entrada + dir * dist * g_pR1, _Digits);
   if(g_pR2 > 0) tp2 = NormalizeDouble(entrada + dir * dist * g_pR2, _Digits);
   double perd = 0;
   if(!OrderCalcProfit(dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, entrada, sl, perd) || perd >= 0)
   { msg = "No puedo calcular cuanto vale ese stop"; return false; }
   double objetivo = AccountInfoDouble(ACCOUNT_BALANCE) * g_pRiesgo / 100.0;
   double paso = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(paso <= 0 || objetivo <= 0) { msg = "Pon un % de riesgo mayor que 0"; return false; }
   lotes = MathFloor(objetivo / MathAbs(perd) / paso + 1e-9) * paso;
   if(lotes < vmin) { msg = "Stop muy lejano: ni el lote minimo cabe en tu %"; return false; }
   if(vmax > 0 && lotes > vmax) lotes = vmax;
   lotes = NormalizeDouble(lotes, 2);
   riesgo = MathAbs(perd) * lotes;
   if(riesgo > objetivo * 1.01) { msg = "Calculo incoherente: no abro"; return false; }
   return true;
}

void PanelActualizar()
{
   if(!g_pListo) return;
   ObjectSetString(0, P + "be", OBJPROP_TEXT, g_pBE ? "Al tocar TP1: stop a la entrada  [SI]" : "Al tocar TP1: stop a la entrada  [NO]");
   ObjectSetInteger(0, P + "be", OBJPROP_BGCOLOR, g_pBE ? C'30,100,60' : C'50,50,50');
   if(!g_prep)
   {
      ObjectSetString(0, P + "abrir", OBJPROP_TEXT, Bloqueada() ? "BLOQUEADA HOY" : "Preparar operacion");
      ObjectSetInteger(0, P + "abrir", OBJPROP_BGCOLOR, Bloqueada() ? C'90,40,40' : C'30,90,160');
      ObjectSetString(0, P + "info1", OBJPROP_TEXT, "Pulsa Preparar y arrastra la linea roja al stop.");
      ObjectSetString(0, P + "info2", OBJPROP_TEXT, "Debajo del precio = compra. Encima = venta.");
      ChartRedraw();
      return;
   }
   int dir; double entrada, sl, tp1, tp2, lotes, riesgo; string msg;
   bool ok = PlanOperacion(dir, entrada, sl, tp1, tp2, lotes, riesgo, msg);
   if(!ok)
   {
      ObjectSetString(0, P + "abrir", OBJPROP_TEXT, "No se puede abrir");
      ObjectSetInteger(0, P + "abrir", OBJPROP_BGCOLOR, C'70,70,70');
      ObjectSetString(0, P + "info1", OBJPROP_TEXT, msg);
      ObjectSetString(0, P + "info2", OBJPROP_TEXT, "");
      if(ObjectFind(0, P + "tp1") >= 0) ObjectDelete(0, P + "tp1");
      if(ObjectFind(0, P + "tp2") >= 0) ObjectDelete(0, P + "tp2");
      ChartRedraw();
      return;
   }
   if(tp1 > 0) PLinea("tp1", tp1, clrMediumSeaGreen, false, STYLE_DASH, "TP1"); else if(ObjectFind(0, P + "tp1") >= 0) ObjectDelete(0, P + "tp1");
   if(tp2 > 0) PLinea("tp2", tp2, clrLimeGreen, false, STYLE_SOLID, "TP2 final"); else if(ObjectFind(0, P + "tp2") >= 0) ObjectDelete(0, P + "tp2");
   double pip = (_Digits == 3 || _Digits == 5) ? 10 * _Point : _Point;
   bool bloq = Bloqueada();
   ObjectSetString(0, P + "abrir", OBJPROP_TEXT, bloq ? "BLOQUEADA HOY" : (dir > 0 ? "COMPRAR " : "VENDER ") + DoubleToString(lotes, 2) + " lotes");
   ObjectSetInteger(0, P + "abrir", OBJPROP_BGCOLOR, bloq ? C'90,40,40' : (dir > 0 ? C'20,120,70' : C'170,50,50'));
   ObjectSetString(0, P + "info1", OBJPROP_TEXT, "Riesgo " + Dinero(riesgo) + " · stop a " + DoubleToString(MathAbs(entrada - sl) / pip, 1) + " pips (" + DoubleToString(sl, _Digits) + ")");
   string t2 = "";
   if(tp1 > 0 && ParcialActiva()) t2 += "TP1 " + DoubleToString(tp1, _Digits) + " (" + (string)g_pPct + " %)  ";
   if(tp2 > 0) t2 += "TP2 " + DoubleToString(tp2, _Digits);
   if(g_limD > 0 && riesgo > g_limD - MathMax(0, g_perdD)) t2 = "OJO: arriesgas mas de lo que te queda hoy";
   ObjectSetString(0, P + "info2", OBJPROP_TEXT, t2);
   ChartRedraw();
}

void PanelPreparar()
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(bid <= 0) return;
   // Stop inicial: 1,5 veces el rango medio de las ultimas 14 velas por debajo del precio (compra). Se arrastra adonde quieras.
   double suma = 0; int n = 0;
   for(int i = 1; i <= 14; i++) { double h = iHigh(_Symbol, PERIOD_CURRENT, i), l = iLow(_Symbol, PERIOD_CURRENT, i); if(h > 0 && l > 0) { suma += h - l; n++; } }
   double rango = n > 0 ? suma / n : 200 * _Point;
   g_slPrecio = NormalizeDouble(bid - 1.5 * rango, _Digits);
   g_prep = true; g_prepSim = _Symbol; g_prepMs = GetTickCount64();
   PLinea("sl", g_slPrecio, clrTomato, true, STYLE_SOLID, "STOP (arrastrame)");
   PanelActualizar();
}

void PanelCancelar()
{
   g_prep = false;
   if(ObjectFind(0, P + "sl") >= 0) ObjectDelete(0, P + "sl");
   if(ObjectFind(0, P + "tp1") >= 0) ObjectDelete(0, P + "tp1");
   if(ObjectFind(0, P + "tp2") >= 0) ObjectDelete(0, P + "tp2");
   PanelActualizar();
}

void PanelAbrir()
{
   if(GetTickCount64() - g_prepMs < 1500) return;   // evita abrir con un doble clic al preparar
   if(Bloqueada()) { Alert("Global Traders FX: la cuenta esta bloqueada hoy por tus limites. No se abre."); return; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { Alert("GTFX: activa el boton \"Algo Trading\" (en verde) para poder abrir desde el panel."); return; }
   int dir; double entrada, sl, tp1, tp2, lotes, riesgo; string msg;
   if(!PlanOperacion(dir, entrada, sl, tp1, tp2, lotes, riesgo, msg)) { Alert("GTFX: no se abre. " + msg); return; }
   if(ConfirmarAbrir)
   {
      string pregunta = (dir > 0 ? "COMPRAR " : "VENDER ") + DoubleToString(lotes, 2) + " lotes de " + _Symbol
                      + "\nRiesgo: " + Dinero(riesgo) + " (" + DoubleToString(g_pRiesgo, 2) + " %)"
                      + "\nStop: " + DoubleToString(sl, _Digits)
                      + (tp1 > 0 && ParcialActiva() ? "\nTP1: " + DoubleToString(tp1, _Digits) + " (cierra " + (string)g_pPct + " %)" : "")
                      + (tp2 > 0 ? "\nTP final: " + DoubleToString(tp2, _Digits) : "")
                      + "\n\nCuenta " + (string)AccountInfoInteger(ACCOUNT_LOGIN) + ". ¿Enviar la orden?";
      if(MessageBox(pregunta, "Global Traders FX", MB_YESNO | MB_ICONQUESTION) != IDYES) return;
      // El precio se ha movido mientras confirmabas: se recalcula con el precio de ahora.
      if(!PlanOperacion(dir, entrada, sl, tp1, tp2, lotes, riesgo, msg)) { Alert("GTFX: no se abre. " + msg); return; }
      if(Bloqueada()) { Alert("Global Traders FX: la cuenta esta bloqueada hoy por tus limites. No se abre."); return; }
   }
   g_trade.SetExpertMagicNumber(MAGIA);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   bool ok = g_trade.PositionOpen(_Symbol, dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, lotes, entrada, sl, tp2, "GTFX panel");
   uint rc = g_trade.ResultRetcode();
   if(!ok || (rc != TRADE_RETCODE_DONE && rc != TRADE_RETCODE_DONE_PARTIAL && rc != TRADE_RETCODE_PLACED))
   {
      Alert("GTFX: el broker no acepto la orden: " + g_trade.ResultRetcodeDescription());
      return;
   }
   // En cuentas con cobertura el ticket de la posicion es el de la orden que la abrio.
   ulong ticket = g_trade.ResultOrder();
   if(ParcialActiva() && tp1 > 0 && ticket > 0)
   {
      GlobalVariableSet("GTFX_TP1_"  + (string)ticket, tp1);
      GlobalVariableSet("GTFX_TP1P_" + (string)ticket, (double)g_pPct);
      GlobalVariableSet("GTFX_TP1B_" + (string)ticket, g_pBE ? 1.0 : 0.0);
   }
   Avisar("Global Traders FX: " + (dir > 0 ? "COMPRA " : "VENTA ") + DoubleToString(lotes, 2) + " " + _Symbol + " · riesgo " + Dinero(riesgo) + " · stop " + DoubleToString(sl, _Digits)
          + (tp2 > 0 ? " · TP final " + DoubleToString(tp2, _Digits) : "") + (ParcialActiva() && tp1 > 0 ? " · TP1 " + DoubleToString(tp1, _Digits) + " lo gestiona el programa" : ""));
   PanelCancelar();
}

// TP1 de las posiciones abiertas con el panel: al tocarlo, cierra la parte indicada y mueve el stop a la entrada.
void GestionarTP1()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      string k = "GTFX_TP1_" + (string)tk;
      if(!GlobalVariableCheck(k)) continue;
      double tp1 = GlobalVariableGet(k);
      string sim = PositionGetString(POSITION_SYMBOL);
      long tipo = PositionGetInteger(POSITION_TYPE);
      double px = tipo == POSITION_TYPE_BUY ? SymbolInfoDouble(sim, SYMBOL_BID) : SymbolInfoDouble(sim, SYMBOL_ASK);
      if(px <= 0 || tp1 <= 0) continue;
      if(tipo == POSITION_TYPE_BUY ? px < tp1 : px > tp1) continue;
      if(GetTickCount64() - g_ultimoTP1 < 2000) return;   // sin rafagas de peticiones
      g_ultimoTP1 = GetTickCount64();
      double vol = PositionGetDouble(POSITION_VOLUME), abre = PositionGetDouble(POSITION_PRICE_OPEN), tp = PositionGetDouble(POSITION_TP), slAct = PositionGetDouble(POSITION_SL);
      double paso = SymbolInfoDouble(sim, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(sim, SYMBOL_VOLUME_MIN);
      int dig = (int)SymbolInfoInteger(sim, SYMBOL_DIGITS);
      double pct = GlobalVariableCheck("GTFX_TP1P_" + (string)tk) ? GlobalVariableGet("GTFX_TP1P_" + (string)tk) : 50;
      bool be = GlobalVariableCheck("GTFX_TP1B_" + (string)tk) && GlobalVariableGet("GTFX_TP1B_" + (string)tk) > 0;
      double cerrar = paso > 0 ? NormalizeDouble(MathFloor(vol * pct / 100.0 / paso + 1e-9) * paso, 2) : 0;
      g_trade.SetTypeFillingBySymbol(sim);
      if(cerrar >= vmin && vol - cerrar >= vmin - 1e-9)
      {
         if(!g_trade.PositionClosePartial(tk, cerrar))
         {
            double fallos = GlobalVariableCheck("GTFX_TP1F_" + (string)tk) ? GlobalVariableGet("GTFX_TP1F_" + (string)tk) : 0;
            Print("GTFX_JournalGuard: no pude cerrar la parte de TP1 de ", tk, ": ", g_trade.ResultRetcodeDescription());
            if(fallos < 4) { GlobalVariableSet("GTFX_TP1F_" + (string)tk, fallos + 1); continue; }
         }
      }
      if(be && PositionSelectByTicket(tk))
      {
         double nuevo = NormalizeDouble(abre, dig);
         bool mejora = tipo == POSITION_TYPE_BUY ? (slAct < nuevo) : (slAct == 0 || slAct > nuevo);
         if(mejora && !g_trade.PositionModify(tk, nuevo, tp))
            Print("GTFX_JournalGuard: no pude mover el stop a la entrada de ", tk, ": ", g_trade.ResultRetcodeDescription());
      }
      GlobalVariableDel(k);
      GlobalVariableDel("GTFX_TP1P_" + (string)tk);
      GlobalVariableDel("GTFX_TP1B_" + (string)tk);
      GlobalVariableDel("GTFX_TP1F_" + (string)tk);
      Avisar("Global Traders FX: TP1 tocado en " + sim + ". Cerrada la parte indicada" + (be ? " y stop movido a la entrada." : "."));
   }
   // Linea de TP1 de las posiciones gestionadas en este grafico (solo informativa).
   if(!g_pListo) return;
   for(int i = ObjectsTotal(0, 0, OBJ_HLINE) - 1; i >= 0; i--)
   {
      string n = ObjectName(0, i, 0, OBJ_HLINE);
      if(StringFind(n, P + "m_") != 0) continue;
      string tkTxt = StringSubstr(n, StringLen(P + "m_"));
      if(!GlobalVariableCheck("GTFX_TP1_" + tkTxt) || !PositionSelectByTicket((ulong)StringToInteger(tkTxt))) ObjectDelete(0, n);
   }
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol || !GlobalVariableCheck("GTFX_TP1_" + (string)tk)) continue;
      PLinea("m_" + (string)tk, GlobalVariableGet("GTFX_TP1_" + (string)tk), clrMediumSeaGreen, false, STYLE_DOT, "TP1 (lo gestiona el programa)");
   }
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(!g_pListo) return;
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam == P + "abrir")    { ObjectSetInteger(0, sparam, OBJPROP_STATE, false); if(!g_prep) { if(!Bloqueada()) PanelPreparar(); } else PanelAbrir(); }
      if(sparam == P + "cancelar") { ObjectSetInteger(0, sparam, OBJPROP_STATE, false); PanelCancelar(); }
      if(sparam == P + "be")       { ObjectSetInteger(0, sparam, OBJPROP_STATE, false); g_pBE = !g_pBE; PanelActualizar(); }
   }
   if(id == CHARTEVENT_OBJECT_ENDEDIT)
   {
      if(sparam == P + "riesgo") { g_pRiesgo = MathMin(5.0, PLeer("riesgo", g_pRiesgo)); ObjectSetString(0, sparam, OBJPROP_TEXT, DoubleToString(g_pRiesgo, 2)); }
      if(sparam == P + "r1")     { g_pR1 = PLeer("r1", g_pR1); ObjectSetString(0, sparam, OBJPROP_TEXT, DoubleToString(g_pR1, 2)); }
      if(sparam == P + "r2")     { g_pR2 = PLeer("r2", g_pR2); ObjectSetString(0, sparam, OBJPROP_TEXT, DoubleToString(g_pR2, 2)); }
      if(sparam == P + "pct")    { g_pPct = (int)MathMin(100, PLeer("pct", g_pPct)); ObjectSetString(0, sparam, OBJPROP_TEXT, (string)g_pPct); }
      PanelActualizar();
   }
   if(id == CHARTEVENT_OBJECT_DRAG && sparam == P + "sl")
   {
      g_slPrecio = ObjectGetDouble(0, P + "sl", OBJPROP_PRICE);
      PanelActualizar();
   }
}

//====================================================================
// SENALES A DISCORD: cada operacion que abres en esta cuenta (desde el movil o desde aqui) se publica sola.
// Espera a que tenga stop (y unos segundos a que pongas el TP), publica entrada, SL, TP1 y TP2, y despues avisa de
// TP1 tocado, TP final, stop o cierre manual. La direccion del webhook se lee del archivo GTFX_discord.txt de la
// carpeta comun de MetaTrader; hay que permitir https://discord.com en Opciones -> Asesores Expertos -> WebRequest.
//====================================================================
string NombreActivo(const string simbolo)
{
   string s = simbolo;
   StringToUpper(s);
   if(StringFind(s, "XAU") >= 0 || StringFind(s, "GOLD") >= 0) return "Gold";
   if(StringFind(s, "XAG") >= 0 || StringFind(s, "SILVER") >= 0) return "Silver";
   if(StringFind(s, "BTC") >= 0) return "Bitcoin";
   if(StringFind(s, "US30") >= 0 || StringFind(s, "DJ30") >= 0 || StringFind(s, "WS30") >= 0) return "US30";
   if(StringFind(s, "NAS") >= 0 || StringFind(s, "USTEC") >= 0 || StringFind(s, "NDX") >= 0 || StringFind(s, "US100") >= 0) return "Nasdaq";
   if(StringFind(s, "SPX") >= 0 || StringFind(s, "US500") >= 0) return "S&P 500";
   // quita el sufijo del broker (EURUSD.r, EURUSD_i, EURUSD#...)
   for(int i = 0; i < StringLen(s); i++)
   {
      ushort c = StringGetCharacter(s, i);
      if(c == '.' || c == '_' || c == '#' || c == '-') return StringSubstr(s, 0, i);
   }
   return s;
}

string JsonEsc(string t)
{
   StringReplace(t, "\\", "\\\\");
   StringReplace(t, "\"", "\\\"");
   StringReplace(t, "\n", "\\n");
   return t;
}

bool LeerWebhook()
{
   if(g_webhook != "") return true;
   int h = FileOpen("GTFX_discord.txt", FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ);
   if(h == INVALID_HANDLE) return false;
   string t = FileReadString(h);
   FileClose(h);
   StringTrimLeft(t);
   StringTrimRight(t);
   if(StringFind(t, "https://discord.com/api/webhooks/") != 0) return false;
   g_webhook = t;
   return true;
}

bool Discord(const string texto)
{
   if(GetTickCount64() < g_discordHasta) return false;
   if(!LeerWebhook())
   {
      if(!g_avisoDiscord) { g_avisoDiscord = true; Alert("GTFX: no encuentro la direccion de Discord (archivo GTFX_discord.txt en la carpeta comun de MetaTrader)."); }
      g_discordHasta = GetTickCount64() + 30000;
      return false;
   }
   string body = "{\"content\":\"" + JsonEsc(texto) + "\"}";
   char datos[];
   StringToCharArray(body, datos, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(datos, ArraySize(datos) - 1);
   char res[];
   string hdr;
   ResetLastError();
   int c = WebRequest("POST", g_webhook, "Content-Type: application/json\r\n", 5000, datos, res, hdr);
   if(c == 204 || c == 200) return true;
   if(c == -1 && GetLastError() == 4014 && !g_avisoDiscord)
   {
      g_avisoDiscord = true;
      Alert("GTFX: para publicar en Discord, Herramientas -> Opciones -> Asesores Expertos -> \"Permitir WebRequest\" y anade https://discord.com");
   }
   else Print("GTFX_JournalGuard: Discord no acepto el mensaje (", c, "): ", CharArrayToString(res, 0, -1, CP_UTF8));
   g_discordHasta = GetTickCount64() + 30000;   // si falla, no insistir durante 30 s (no frenar al guardian)
   return false;
}

void Senales()
{
   if(!SenalesDiscord) return;
   datetime ahora = TimeTradeServer();
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      string k = "GTFX_SD_" + (string)tk, k1 = "GTFX_SD1_" + (string)tk;
      string sim = PositionGetString(POSITION_SYMBOL), act = NombreActivo(sim);
      int dir = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double abre = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      int dig = (int)SymbolInfoInteger(sim, SYMBOL_DIGITS);
      datetime t0 = (datetime)PositionGetInteger(POSITION_TIME);
      string lado = dir > 0 ? "BUY" : "SELL";
      if(!GlobalVariableCheck(k))
      {
         long edad = (long)(ahora - t0);
         if(t0 < g_senalDesde || edad > 600) continue;        // anteriores a activar las senales, o ya viejas: no se publican
         if(Bloqueada()) continue;                             // en bloqueo el guardian la va a cerrar
         if(sl <= 0) continue;                                 // sin stop no se publica
         if(tp <= 0 && edad < SenalEsperaSeg) continue;        // tiempo para que pongas el TP
         if(GetTickCount64() - g_ultDiscord < 1500) return;
         g_ultDiscord = GetTickCount64();
         double riesgo = MathAbs(abre - sl);
         double tp1 = SenalTP1_R > 0 && riesgo > 0 ? NormalizeDouble(abre + dir * riesgo * SenalTP1_R, dig) : 0;
         bool dosTP = tp > 0 && tp1 > 0 && (dir > 0 ? tp1 < tp : tp1 > tp) && MathAbs(tp - tp1) > riesgo * 0.05;
         string m = (dir > 0 ? "🟢 **BUY " : "🔴 **SELL ") + act + " NOW**\n" + act + " Entrada: " + DoubleToString(abre, dig) + (SenalCerca != "" ? " " + SenalCerca : "")
                  + "\nSL: " + DoubleToString(sl, dig);
         if(dosTP)
            m += "\nTP1: " + DoubleToString(tp1, dig) + "  (" + DoubleToString(SenalTP1_R, 1) + "R)\nTP2: " + DoubleToString(tp, dig) + "  (" + DoubleToString(MathAbs(tp - abre) / riesgo, 1) + "R)";
         else if(tp > 0)
            m += "\nTP: " + DoubleToString(tp, dig) + "  (" + DoubleToString(MathAbs(tp - abre) / riesgo, 1) + "R)";
         else if(tp1 > 0)
            m += "\nTP1: " + DoubleToString(tp1, dig) + "  (" + DoubleToString(SenalTP1_R, 1) + "R)";
         if(SenalPie != "") m += "\n⚠️ " + SenalPie;
         if(Discord(m))
         {
            GlobalVariableSet(k, 1);
            if(tp1 > 0 && (dosTP || tp <= 0)) GlobalVariableSet(k1, tp1);
            Print("GTFX_JournalGuard: senal publicada en Discord: ", lado, " ", act, " ", DoubleToString(abre, dig));
         }
         continue;
      }
      if(GlobalVariableCheck(k1))
      {
         double tp1 = GlobalVariableGet(k1);
         double px = dir > 0 ? SymbolInfoDouble(sim, SYMBOL_BID) : SymbolInfoDouble(sim, SYMBOL_ASK);
         if(px > 0 && tp1 > 0 && (dir > 0 ? px >= tp1 : px <= tp1))
         {
            if(GetTickCount64() - g_ultDiscord < 1500) return;
            g_ultDiscord = GetTickCount64();
            if(Discord("✅ **TP1 alcanzado** · " + act + "\n" + lado + " " + act + " · Entrada " + DoubleToString(abre, dig) + " · TP1 " + DoubleToString(tp1, dig)))
               GlobalVariableDel(k1);
         }
      }
   }
}

// Al cerrarse del todo una operacion publicada: TP final, stop o cierre manual.
void SenalCierre(const ulong deal)
{
   if(!SenalesDiscord || deal == 0 || !HistoryDealSelect(deal)) return;
   long ent = HistoryDealGetInteger(deal, DEAL_ENTRY);
   if(ent != DEAL_ENTRY_OUT && ent != DEAL_ENTRY_OUT_BY) return;
   ulong pos = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   string k = "GTFX_SD_" + (string)pos;
   if(!GlobalVariableCheck(k) || PositionSelectByTicket(pos)) return;   // no publicada, o cierre parcial (sigue abierta)
   string sim = HistoryDealGetString(deal, DEAL_SYMBOL), act = NombreActivo(sim);
   int dig = (int)SymbolInfoInteger(sim, SYMBOL_DIGITS);
   string px = DoubleToString(HistoryDealGetDouble(deal, DEAL_PRICE), dig);
   double prof = HistoryDealGetDouble(deal, DEAL_PROFIT);
   long razon = HistoryDealGetInteger(deal, DEAL_REASON);
   string m;
   if(razon == DEAL_REASON_TP)      m = "🎯 **TP final alcanzado** · " + act + " en " + px;
   else if(razon == DEAL_REASON_SL) m = prof > 0 ? "🔒 **Cerrada en ganancia por el stop** · " + act + " en " + px : "❌ **Stop tocado** · " + act + " en " + px;
   else                             m = (prof >= 0 ? "✅" : "⚪") + " **Operacion cerrada** · " + act + " en " + px;
   Discord(m);
   GlobalVariableDel(k);
   GlobalVariableDel("GTFX_SD1_" + (string)pos);
}

void Revisar()
{
   Calcular();
   Aplicar();
   Pintar();
   PanelActualizar();
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
   EventSetTimer(1);
   // Senales a Discord: solo las operaciones abiertas desde que se activan (recordado aunque se reinicie el terminal).
   string gvDesde = Gv("senal_desde");
   if(SenalesDiscord)
   {
      if(!GlobalVariableCheck(gvDesde)) GlobalVariableSet(gvDesde, (double)TimeTradeServer());
      g_senalDesde = (datetime)GlobalVariableGet(gvDesde);
      g_avisoDiscord = false; g_discordHasta = 0; g_webhook = "";
   }
   else if(GlobalVariableCheck(gvDesde)) GlobalVariableDel(gvDesde);
   // Valores del panel: de los parametros al arrancar o al cambiarlos; lo que escribas en el panel se conserva al cambiar de marco.
   static bool primera = true;
   if(primera || UninitializeReason() == REASON_PARAMETERS)
   {
      g_pRiesgo = MathMax(0, MathMin(5.0, RiesgoPct)); g_pR1 = MathMax(0, TP1_R); g_pR2 = MathMax(0, TP2_R);
      g_pPct = (int)MathMax(0, MathMin(100, PctEnTP1)); g_pBE = StopAEntrada;
      primera = false;
   }
   if(g_prep && g_prepSim != _Symbol) g_prep = false;   // otro simbolo: se descarta la operacion a medio preparar
   Consultar();
   Calcular();
   Aplicar();
   Pintar();
   PanelCrear();
   if(g_prep && PanelActivo) { PLinea("sl", g_slPrecio, clrTomato, true, STYLE_SOLID, "STOP (arrastrame)"); PanelActualizar(); }
   Print("GTFX_JournalGuard 3.1 en la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), " · limite dia ", Dinero(g_limD), " · semana ", Dinero(g_limW), " · operaciones ", (string)g_maxN);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
   PanelBorrar();
}

void OnTimer()
{
   static int n = 0;
   GestionarTP1();
   Senales();
   if(++n >= MathMax(2, Segundos)) { n = 0; Consultar(); Revisar(); }
   else if(g_prep) PanelActualizar();
}

void OnTick()
{
   Aplicar();
   GestionarTP1();
   if(g_prep) PanelActualizar();
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) { SenalCierre(trans.deal); Revisar(); }
}
//+------------------------------------------------------------------+
