//+------------------------------------------------------------------+
//| GTFX · Exportar historial de operaciones                         |
//| Guarda en la carpeta común (Common\Files) las operaciones de la  |
//| cuenta (entrada, salida, SL y TP) y, de cada una, el recorrido   |
//| del precio tick a tick (solo los nuevos máximos y mínimos), para |
//| medir qué habría pasado con otro stop. Solo LEE: no abre, cierra |
//| ni modifica nada.                                                |
//+------------------------------------------------------------------+
#property copyright "Global Traders FX"
#property version   "1.00"
input int DiasAtras   = 150;   // cuántos días de historial
input int HorasDespues = 6;    // horas de recorrido tras el cierre de cada operación

string F(const double v,const int d) { return DoubleToString(v,d); }

void OnStart()
  {
   datetime ahora=TimeTradeServer();
   datetime desde=ahora-(datetime)DiasAtras*86400;
   long login=AccountInfoInteger(ACCOUNT_LOGIN);
   int gmt=(int)(TimeTradeServer()-TimeGMT());
   if(!HistorySelect(desde,ahora+86400)) { Alert("GTFX: no se pudo leer el historial"); return; }
   int total=HistoryDealsTotal();
   string base="GTFX_historial_"+IntegerToString(login);
   int h=FileOpen(base+".csv",FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(h==INVALID_HANDLE) { Alert("GTFX: no se pudo crear el archivo"); return; }
   FileWriteString(h,"# servidor="+AccountInfoString(ACCOUNT_SERVER)+";moneda="+AccountInfoString(ACCOUNT_CURRENCY)+";gmt_offset_s="+IntegerToString(gmt)+";generado="+TimeToString(ahora,TIME_DATE|TIME_SECONDS)+"\r\n");
   FileWriteString(h,"deal;position;time;time_msc;symbol;type;entry;volume;price;sl;tp;profit;commission;swap;fee;reason;order;order_sl;order_tp;order_type;digits;point;comment\r\n");
   // posiciones: entrada y última salida
   ulong pids[]; string psym[]; int pdir[]; double ppx[]; long pin[]; long pout[];
   int np=0;
   for(int i=0;i<total;i++)
     {
      ulong t=HistoryDealGetTicket(i); if(t==0) continue;
      long type=HistoryDealGetInteger(t,DEAL_TYPE); if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;
      string sym=HistoryDealGetString(t,DEAL_SYMBOL);
      long entry=HistoryDealGetInteger(t,DEAL_ENTRY);
      ulong pid=(ulong)HistoryDealGetInteger(t,DEAL_POSITION_ID);
      ulong ord=(ulong)HistoryDealGetInteger(t,DEAL_ORDER);
      long msc=HistoryDealGetInteger(t,DEAL_TIME_MSC);
      int dg=(int)SymbolInfoInteger(sym,SYMBOL_DIGITS); double pt=SymbolInfoDouble(sym,SYMBOL_POINT);
      double osl=0,otp=0; long otype=-1;
      if(ord>0 && HistoryOrderSelect(ord)) { osl=HistoryOrderGetDouble(ord,ORDER_SL); otp=HistoryOrderGetDouble(ord,ORDER_TP); otype=HistoryOrderGetInteger(ord,ORDER_TYPE); }
      string c=HistoryDealGetString(t,DEAL_COMMENT); StringReplace(c,";",","); StringReplace(c,"\r"," "); StringReplace(c,"\n"," ");
      FileWriteString(h,IntegerToString((long)t)+";"+IntegerToString((long)pid)+";"+TimeToString((datetime)HistoryDealGetInteger(t,DEAL_TIME),TIME_DATE|TIME_SECONDS)+";"+IntegerToString(msc)+";"+sym+";"+IntegerToString(type)+";"+IntegerToString(entry)+";"+F(HistoryDealGetDouble(t,DEAL_VOLUME),2)+";"+F(HistoryDealGetDouble(t,DEAL_PRICE),dg)+";"+F(HistoryDealGetDouble(t,DEAL_SL),dg)+";"+F(HistoryDealGetDouble(t,DEAL_TP),dg)+";"+F(HistoryDealGetDouble(t,DEAL_PROFIT),2)+";"+F(HistoryDealGetDouble(t,DEAL_COMMISSION),2)+";"+F(HistoryDealGetDouble(t,DEAL_SWAP),2)+";"+F(HistoryDealGetDouble(t,DEAL_FEE),2)+";"+IntegerToString(HistoryDealGetInteger(t,DEAL_REASON))+";"+IntegerToString((long)ord)+";"+F(osl,dg)+";"+F(otp,dg)+";"+IntegerToString(otype)+";"+IntegerToString(dg)+";"+F(pt,dg)+";"+c+"\r\n");
      // registro de la posición
      int k=-1; for(int j=0;j<np;j++) if(pids[j]==pid) { k=j; break; }
      if(entry==DEAL_ENTRY_IN && k<0)
        {
         ArrayResize(pids,np+1); ArrayResize(psym,np+1); ArrayResize(pdir,np+1); ArrayResize(ppx,np+1); ArrayResize(pin,np+1); ArrayResize(pout,np+1);
         pids[np]=pid; psym[np]=sym; pdir[np]=(type==DEAL_TYPE_BUY?1:-1); ppx[np]=HistoryDealGetDouble(t,DEAL_PRICE); pin[np]=msc; pout[np]=0; np++;
        }
      else if(k>=0 && entry!=DEAL_ENTRY_IN && msc>pout[k]) pout[k]=msc;
     }
   FileClose(h);
   // recorrido del precio de cada posición: nuevos máximos (H) y mínimos (L) del precio al que se cerraría (bid en compras, ask en ventas)
   int g=FileOpen(base+"_ruta.csv",FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   int conTicks=0,conM1=0,sin=0;
   if(g!=INVALID_HANDLE)
     {
      FileWriteString(g,"position;time_msc;price;tag\r\n");
      for(int j=0;j<np && !IsStopped();j++)
        {
         long a=pin[j]; long b=(pout[j]>0?pout[j]:(long)TimeCurrent()*1000)+(long)HorasDespues*3600*1000;
         int dg=(int)SymbolInfoInteger(psym[j],SYMBOL_DIGITS);
         SymbolSelect(psym[j],true);
         MqlTick tk[]; int n=-1;
         for(int r=0;r<4 && n<=0;r++) { ResetLastError(); n=CopyTicksRange(psym[j],tk,COPY_TICKS_INFO,(ulong)a,(ulong)b); if(n<=0) Sleep(700); }
         string pid=IntegerToString((long)pids[j]);
         if(n>0)
           {
            double hi=-DBL_MAX,lo=DBL_MAX;
            for(int i=0;i<n;i++)
              {
               double p=(pdir[j]>0?tk[i].bid:tk[i].ask); if(p<=0) continue;
               if(p>hi) { hi=p; FileWriteString(g,pid+";"+IntegerToString(tk[i].time_msc)+";"+F(p,dg)+";H\r\n"); }
               if(p<lo) { lo=p; FileWriteString(g,pid+";"+IntegerToString(tk[i].time_msc)+";"+F(p,dg)+";L\r\n"); }
              }
            FileWriteString(g,pid+";"+IntegerToString(n)+";0;T\r\n"); conTicks++;
           }
         else
           {
            MqlRates rt[]; int m=-1;
            for(int r=0;r<4 && m<=0;r++) { m=CopyRates(psym[j],PERIOD_M1,(datetime)(a/1000),(datetime)(b/1000),rt); if(m<=0) Sleep(700); }
            if(m>0)
              {
               double pt=SymbolInfoDouble(psym[j],SYMBOL_POINT); double hi=-DBL_MAX,lo=DBL_MAX;
               for(int i=0;i<m;i++)
                 {
                  double add=(pdir[j]>0?0.0:rt[i].spread*pt); double ph=rt[i].high+add,pl=rt[i].low+add; long ms=(long)rt[i].time*1000;
                  // dentro de una vela de 1 min no se sabe el orden: se escribe primero lo que va en contra de la operación
                  if(pdir[j]>0) { if(pl<lo) { lo=pl; FileWriteString(g,pid+";"+IntegerToString(ms)+";"+F(pl,dg)+";L\r\n"); } if(ph>hi) { hi=ph; FileWriteString(g,pid+";"+IntegerToString(ms+59000)+";"+F(ph,dg)+";H\r\n"); } }
                  else          { if(ph>hi) { hi=ph; FileWriteString(g,pid+";"+IntegerToString(ms)+";"+F(ph,dg)+";H\r\n"); } if(pl<lo) { lo=pl; FileWriteString(g,pid+";"+IntegerToString(ms+59000)+";"+F(pl,dg)+";L\r\n"); } }
                 }
               FileWriteString(g,pid+";"+IntegerToString(m)+";0;M\r\n"); conM1++;
              }
            else { FileWriteString(g,pid+";0;0;X\r\n"); sin++; }
           }
        }
      FileClose(g);
     }
   Alert("GTFX: historial exportado · ",np," operaciones · recorrido con ticks: ",conTicks,", con velas de 1 min: ",conM1,", sin precio: ",sin);
  }
