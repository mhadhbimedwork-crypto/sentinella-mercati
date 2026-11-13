package it.sentinella.mercati;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Guscio dell'app: carica la versione online di Sentinella Mercati.
// Ogni modifica pubblicata su GitHub arriva da sola, senza installare un nuovo APK.
public class MainActivity extends Activity {
    static final String HOME = "https://mhadhbimedwork-crypto.github.io/sentinella-mercati/";
    WebView web;
    long pausedAt = 0;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#0e1420"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0e1420"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (u.toString().startsWith(HOME)) return false;
                // collegamenti esterni (justETF, SEC, broker) nel browser del telefono
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null,
                    "<html><body style='background:#0e1420;color:#e6ebf5;font-family:sans-serif;padding:32px'>" +
                    "<h2>Nessuna connessione</h2><p>Sentinella Mercati ha bisogno di internet per leggere i mercati.</p>" +
                    "<p><a style='color:#e0a63a;font-size:20px' href='" + HOME + "'>Tocca per riprovare</a></p></body></html>",
                    "text/html", "utf-8", null);
            }
        });
        setContentView(web);
        if (b != null) web.restoreState(b); else web.loadUrl(HOME);
    }
    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override protected void onPause() { super.onPause(); pausedAt = System.currentTimeMillis(); }
    @Override protected void onResume() {
        super.onResume();
        // dopo 10 minuti in background ricarica: prende l'ultima versione dell'app e dei dati
        if (pausedAt > 0 && System.currentTimeMillis() - pausedAt > 600000) web.reload();
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
