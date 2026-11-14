//+------------------------------------------------------------------+
//| GTFX · Exportar barras                                           |
//| Descarga el historial del servidor y lo guarda en la carpeta     |
//| común (Common\Files) con el mismo formato que Símbolos → Barras  |
//| → Exportar. Solo lee precios: no abre, cierra ni modifica nada.  |
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "1.10"
input string   Simbolos = "US100,US30,US500";
input string   Periodos = "M5,M15,H1";
input datetime Desde    = D'2020.01.01 00:00';
input bool     CerrarGrafico = true;

ENUM_TIMEFRAMES TF(const string s)
  {
   if(s=="M1") return PERIOD_M1;  if(s=="M5") return PERIOD_M5;  if(s=="M10") return PERIOD_M10;
   if(s=="M15") return PERIOD_M15; if(s=="M30") return PERIOD_M30; if(s=="H1") return PERIOD_H1;
   if(s=="H4") return PERIOD_H4;  if(s=="D1") return PERIOD_D1;
   return PERIOD_CURRENT;
  }
void Estado(const string txt)
  {
   int h=FileOpen("GTFX_export_estado.txt",FILE_WRITE|FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ);
   if(h==INVALID_HANDLE) return;
   FileSeek(h,0,SEEK_END);
   FileWriteString(h,TimeToString(TimeLocal(),TIME_DATE|TIME_SECONDS)+" "+txt+"\r\n");
   FileClose(h);
   Print(txt);
  }
// Pide el historial hasta que deja de crecer hacia atrás (el servidor lo va enviando por trozos).
int Cargar(const string sym,const ENUM_TIMEFRAMES tf,MqlRates &r[])
  {
   datetime primero=0; int iguales=0,n=-1;
   for(int i=0;i<180 && !IsStopped();i++)
     {
      ResetLastError();
      n=CopyRates(sym,tf,g_desde,TimeCurrent()+86400,r);
      if(n>0)
        {
         if(r[0].time==primero) iguales++; else { iguales=0; primero=r[0].time; }
         if(r[0].time<=g_desde+7*86400 || iguales>=8) break;
        }
      Sleep(1500);
     }
   return n;
  }
// Pedido opcional en Common\Files\GTFX_export_pedido.txt: "SIMBOLOS;PERIODOS;AAAA.MM.DD" (p. ej. "XAUUSD,XAGUSD;M5,M15,H1;2020.01.01").
// Si existe, manda sobre los parámetros; así no hay que recompilar ni abrir el diálogo.
string g_sim, g_per; datetime g_desde;
void LeerPedido()
  {
   g_sim=Simbolos; g_per=Periodos; g_desde=Desde;
   int h=FileOpen("GTFX_export_pedido.txt",FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(h==INVALID_HANDLE) return;
   string line=FileReadString(h); FileClose(h);
   string p[]; if(StringSplit(line,';',p)<2) return;
   StringTrimLeft(p[0]); StringTrimRight(p[0]); StringTrimLeft(p[1]); StringTrimRight(p[1]);
   g_sim=p[0]; g_per=p[1];
   if(ArraySize(p)>=3) { StringTrimLeft(p[2]); StringTrimRight(p[2]); datetime d=StringToTime(p[2]); if(d>0) g_desde=d; }
  }
void OnStart()
  {
   LeerPedido();
   FileDelete("GTFX_export_estado.txt",FILE_COMMON);
   Estado("inicio · servidor "+AccountInfoString(ACCOUNT_SERVER)+" · max barras "+(string)TerminalInfoInteger(TERMINAL_MAXBARS));
   string ss[],pp[]; int ns=StringSplit(g_sim,',',ss),np=StringSplit(g_per,',',pp);
   for(int a=0;a<ns && !IsStopped();a++)
     {
      string sym=ss[a];
      if(!SymbolSelect(sym,true)) { Estado(sym+": no existe en este broker"); continue; }
      int dig=(int)SymbolInfoInteger(sym,SYMBOL_DIGITS);
      for(int b=0;b<np && !IsStopped();b++)
        {
         ENUM_TIMEFRAMES tf=TF(pp[b]); if(tf==PERIOD_CURRENT) continue;
         MqlRates r[]; int n=Cargar(sym,tf,r);
         if(n<=0) { Estado(sym+" "+pp[b]+": sin datos (error "+(string)GetLastError()+")"); continue; }
         string name="GTFX_export_"+sym+"_"+pp[b]+".csv";
         int h=FileOpen(name,FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
         if(h==INVALID_HANDLE) { Estado(sym+" "+pp[b]+": no pude crear el archivo"); continue; }
         FileWriteString(h,"<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");
         for(int i=0;i<n;i++)
           {
            string d=TimeToString(r[i].time,TIME_DATE), t=TimeToString(r[i].time,TIME_SECONDS);
            FileWriteString(h,d+"\t"+t+"\t"+DoubleToString(r[i].open,dig)+"\t"+DoubleToString(r[i].high,dig)+"\t"+DoubleToString(r[i].low,dig)+"\t"+DoubleToString(r[i].close,dig)+"\t"+(string)r[i].tick_volume+"\t"+(string)r[i].real_volume+"\t"+(string)r[i].spread+"\r\n");
           }
         FileClose(h);
         Estado(sym+" "+pp[b]+": "+(string)n+" velas · "+TimeToString(r[0].time)+" → "+TimeToString(r[n-1].time));
        }
     }
   Estado("FIN");
   if(CerrarGrafico) ChartClose(0);
  }
//+------------------------------------------------------------------+
