//+------------------------------------------------------------------+
//| GTFX_JournalSync.mq5  (Servicio de MetaTrader 5)                  |
//| Envia al journal de Global Traders FX, de forma automatica:       |
//|   - cada posicion cerrada (simbolo, lado, lotes, precios, horas,  |
//|     beneficio, comision y swap)                                   |
//|   - el balance, la equidad y el flotante de la cuenta             |
//| No opera, no modifica ordenes y no usa ninguna contrasena: se     |
//| identifica con el token que genera el journal para ESTA cuenta.   |
//| Consumo minimo para el broker: cada 10 s solo lee valores que el  |
//| terminal ya tiene en memoria (balance, equidad, posiciones); el   |
//| historial se consulta unicamente cuando algo cambio, y el envio   |
//| va a este journal por HTTPS, nunca al servidor del broker.        |
//|                                                                  |
//| Instalacion (una sola vez):                                       |
//|  1. Herramientas -> Opciones -> Asesores Expertos -> marcar       |
//|     "Permitir WebRequest para las URL listadas" y anadir          |
//|     https://journal.cesarzorrilla.com                             |
//|  2. Copiar este archivo en <Carpeta de datos>\MQL5\Services       |
//|     (Archivo -> Abrir carpeta de datos) y compilarlo (F7), o      |
//|     copiar directamente el .ex5.                                  |
//|  3. Navegador -> Servicios -> clic derecho -> "Anadir servicio"   |
//|     -> GTFX_JournalSync -> pegar el token -> Aceptar.             |
//| Arranca solo con MetaTrader. Si el PC estuvo apagado, al abrir    |
//| MT5 envia todo lo que se cerro mientras tanto.                    |
//+------------------------------------------------------------------+
#property service
#property strict
#property version   "1.1"
#property description "Sincroniza las operaciones cerradas y el balance de esta cuenta con el journal de Global Traders FX."

input string JournalUrl    = "https://journal.cesarzorrilla.com"; // Direccion del journal
input string Token         = "";   // Token de sincronizacion (journal -> Cuentas -> Sincronizar)
input int    Segundos      = 10;   // Cada cuantos segundos se revisa la cuenta
input int    DiasHistorial = 90;   // Dias de historial en la primera sincronizacion
input int    LatidoMinutos = 5;    // Envia el balance aunque no haya operaciones nuevas

#define LOTE_MAXIMO 200            // posiciones por envio

string  g_gv          = "";
string  g_firma       = "";
datetime g_ultimoEnvio = 0;
datetime g_ultimoAviso = 0;
bool    g_bloqueada   = false;

//--- texto seguro para JSON
string Esc(string s)
{
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
   {
      ushort c = StringGetCharacter(s, i);
      if(c == '"' || c == '\\') { out += "\\"; out += ShortToString(c); }
      else if(c < 32)           out += " ";
      else                      out += ShortToString(c);
   }
   return out;
}

void Aviso(string texto)
{
   // Como mucho un mensaje por minuto en el registro, para no llenarlo.
   if(TimeLocal() - g_ultimoAviso < 60) return;
   g_ultimoAviso = TimeLocal();
   Print("GTFX_JournalSync: ", texto);
}

//--- identificadores de las posiciones con algun cierre desde `desde`
int PosicionesConCierre(datetime desde, ulong &ids[])
{
   ArrayResize(ids, 0);
   if(!HistorySelect(desde, TimeTradeServer() + 86400)) return 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      long tipo = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      long entrada = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entrada != DEAL_ENTRY_OUT && entrada != DEAL_ENTRY_OUT_BY && entrada != DEAL_ENTRY_INOUT) continue;
      ulong pid = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if(pid == 0) continue;
      bool visto = false;
      for(int k = ArraySize(ids) - 1; k >= 0; k--)
         if(ids[k] == pid) { visto = true; break; }
      if(!visto)
      {
         int n = ArraySize(ids);
         ArrayResize(ids, n + 1);
         ids[n] = pid;
      }
   }
   return ArraySize(ids);
}

//--- JSON de una posicion totalmente cerrada (false si sigue abierta o no se puede leer)
bool PosicionJson(ulong pid, string &json, datetime &cierre)
{
   cierre = 0;
   if(PositionSelectByTicket(pid)) return false;        // cierre parcial: todavia abierta
   if(!HistorySelectByPosition((long)pid)) return false;
   int total = HistoryDealsTotal();
   double volEntrada = 0, volSalida = 0, sumaEntrada = 0, sumaSalida = 0;
   double beneficio = 0, comision = 0, swap = 0, tasa = 0;
   datetime apertura = 0;
   long tipoInicial = -1;
   string simbolo = "";
   for(int i = 0; i < total; i++)
   {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      long entrada  = HistoryDealGetInteger(t, DEAL_ENTRY);
      double vol    = HistoryDealGetDouble(t, DEAL_VOLUME);
      double precio = HistoryDealGetDouble(t, DEAL_PRICE);
      datetime hora = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      beneficio += HistoryDealGetDouble(t, DEAL_PROFIT);
      comision  += HistoryDealGetDouble(t, DEAL_COMMISSION);
      swap      += HistoryDealGetDouble(t, DEAL_SWAP);
      tasa      += HistoryDealGetDouble(t, DEAL_FEE);
      if(entrada == DEAL_ENTRY_IN)
      {
         if(apertura == 0 || hora < apertura)
         {
            apertura    = hora;
            tipoInicial = tipo;
            simbolo     = HistoryDealGetString(t, DEAL_SYMBOL);
         }
         volEntrada  += vol;
         sumaEntrada += vol * precio;
      }
      else
      {
         volSalida  += vol;
         sumaSalida += vol * precio;
         if(hora > cierre) cierre = hora;
      }
   }
   if(volEntrada <= 0 || apertura == 0 || cierre == 0) return false;
   if(volSalida + 0.0000001 < volEntrada) return false;  // no esta cerrada del todo
   int digitos = (int)SymbolInfoInteger(simbolo, SYMBOL_DIGITS);
   if(digitos <= 0) digitos = 5;
   json = "{\"id\":\"" + (string)pid + "\""
        + ",\"symbol\":\"" + Esc(simbolo) + "\""
        + ",\"type\":\"" + (tipoInicial == DEAL_TYPE_BUY ? "buy" : "sell") + "\""
        + ",\"volume\":" + DoubleToString(volEntrada, 2)
        + ",\"open_price\":" + DoubleToString(sumaEntrada / volEntrada, digitos)
        + ",\"close_price\":" + DoubleToString(sumaSalida / volSalida, digitos)
        + ",\"open_time\":" + (string)(long)apertura
        + ",\"close_time\":" + (string)(long)cierre
        + ",\"profit\":" + DoubleToString(beneficio, 2)
        + ",\"commission\":" + DoubleToString(comision, 2)
        + ",\"swap\":" + DoubleToString(swap, 2)
        + ",\"fee\":" + DoubleToString(tasa, 2) + "}";
   return true;
}

string CuentaJson()
{
   double flotante = AccountInfoDouble(ACCOUNT_PROFIT);
   return "{\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\""
        + ",\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\""
        + ",\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY)) + "\""
        + ",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)
        + ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)
        + ",\"floating\":" + DoubleToString(flotante, 2)
        + ",\"open_positions\":" + (string)PositionsTotal()
        + ",\"server_time\":" + (string)(long)TimeTradeServer()
        + ",\"gmt_time\":" + (string)(long)TimeGMT() + "}";
}

//--- envia un lote; devuelve el codigo HTTP (o -1)
int Enviar(string posiciones, string &respuesta)
{
   string url = JournalUrl + "/api/sync/mt5";
   string cabeceras = "Content-Type: application/json\r\nAuthorization: Bearer " + Token + "\r\n";
   string cuerpo = "{\"account\":" + CuentaJson() + ",\"positions\":[" + posiciones + "]}";
   char datos[];
   char resultado[];
   string cabecerasRespuesta;
   int len = StringToCharArray(cuerpo, datos, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(datos, len - 1);              // sin el terminador nulo
   ResetLastError();
   int codigo = WebRequest("POST", url, cabeceras, 15000, datos, resultado, cabecerasRespuesta);
   respuesta = CharArrayToString(resultado, 0, WHOLE_ARRAY, CP_UTF8);
   if(codigo == -1)
   {
      int err = GetLastError();
      if(err == 4014)
         Aviso("MetaTrader no permite la conexion. Ve a Herramientas -> Opciones -> Asesores Expertos, marca \"Permitir WebRequest\" y anade " + JournalUrl);
      else
         Aviso("sin conexion con el journal (error " + (string)err + "). Se reintenta solo.");
   }
   return codigo;
}

void ProcesarRespuesta(int codigo, string respuesta)
{
   if(codigo == 200)
   {
      bool bloqueada = StringFind(respuesta, "\"locked\":true") >= 0;
      if(bloqueada && !g_bloqueada)
         Alert("Global Traders FX: el journal ha BLOQUEADO esta cuenta por tu limite de riesgo. Deja de operar hoy y revisa el journal.");
      g_bloqueada = bloqueada;
      return;
   }
   if(codigo == 401)      Aviso("el token no es valido o fue revocado. Genera uno nuevo en el journal (Cuentas -> Sincronizar) y vuelve a anadir el servicio.");
   else if(codigo == 409) Aviso("el journal rechazo el envio: " + respuesta);
   else if(codigo == 402) Aviso("la suscripcion del journal no esta activa.");
   else if(codigo == 429) Aviso("demasiados envios seguidos; se reintenta en un minuto.");
   else if(codigo != -1)  Aviso("respuesta inesperada del journal (" + (string)codigo + "): " + respuesta);
}

void Ciclo()
{
   // 1) Firma barata con datos que el terminal ya tiene en memoria (no genera peticiones al broker):
   //    balance, numero de posiciones abiertas y tickets abiertos. Si no cambia y no toca latido, no se hace nada mas.
   string firma = DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "|" + (string)PositionsTotal();
   for(int p = PositionsTotal() - 1; p >= 0; p--) firma += "|" + (string)PositionGetTicket(p);
   int latido = PositionsTotal() > 0 ? 60 : MathMax(1, LatidoMinutos) * 60;
   if(firma == g_firma && TimeLocal() - g_ultimoEnvio < latido) return;

   // 2) Solo ahora se consulta el historial (una posicion se cerro, el balance cambio o toca el latido).
   datetime ahora = TimeTradeServer();
   datetime ultimoCierre = GlobalVariableCheck(g_gv) ? (datetime)(long)GlobalVariableGet(g_gv) : 0;
   datetime desde = ultimoCierre > 0 ? ultimoCierre - 3 * 86400 : ahora - (datetime)(MathMax(1, DiasHistorial) * 86400);

   ulong ids[];
   int n = PosicionesConCierre(desde, ids);

   string lote = "";
   int enLote = 0;
   datetime maxCierre = ultimoCierre;
   bool todoBien = true;
   string respuesta = "";
   for(int i = 0; i < n && todoBien; i++)
   {
      string json;
      datetime cierre;
      if(!PosicionJson(ids[i], json, cierre)) continue;
      if(cierre > maxCierre) maxCierre = cierre;
      lote += (enLote > 0 ? "," : "") + json;
      enLote++;
      if(enLote >= LOTE_MAXIMO)
      {
         int codigo = Enviar(lote, respuesta);
         ProcesarRespuesta(codigo, respuesta);
         todoBien = (codigo == 200);
         lote = "";
         enLote = 0;
      }
   }
   if(todoBien)
   {
      int codigo = Enviar(lote, respuesta);                // el ultimo lote (o solo el latido si esta vacio)
      ProcesarRespuesta(codigo, respuesta);
      todoBien = (codigo == 200);
   }
   if(todoBien)
   {
      // Solo se avanza la marca cuando TODO llego: si algo falla, el siguiente ciclo lo reenvia (el journal no duplica).
      if(maxCierre > ultimoCierre) GlobalVariableSet(g_gv, (double)(long)maxCierre);
      g_firma = firma;
      g_ultimoEnvio = TimeLocal();
   }
}

void OnStart()
{
   if(StringLen(Token) < 20)
   {
      Alert("GTFX_JournalSync: falta el token. Generalo en el journal (Cuentas -> Sincronizar) y pegalo al anadir el servicio.");
      return;
   }
   Print("GTFX_JournalSync: iniciado. Envia a ", JournalUrl, " las operaciones cerradas de la cuenta ", (string)AccountInfoInteger(ACCOUNT_LOGIN), ".");
   while(!IsStopped())
   {
      long login = AccountInfoInteger(ACCOUNT_LOGIN);
      if(login > 0 && TerminalInfoInteger(TERMINAL_CONNECTED))
      {
         g_gv = "GTFX_SYNC_" + (string)login;
         Ciclo();
      }
      Sleep(MathMax(5, Segundos) * 1000);
   }
   Print("GTFX_JournalSync: detenido.");
}
