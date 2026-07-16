package com.dailyhealth.mobile;

import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {
    private static final String LOCAL_HEALTH_URL = "http://127.0.0.1:34189/api/health";
    private volatile boolean destroyed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CapacitorSQLitePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setVisibility(View.INVISIBLE);
        waitForEmbeddedServer();
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        super.onDestroy();
    }

    private void waitForEmbeddedServer() {
        new Thread(() -> {
            while (!destroyed && !isFinishing()) {
                if (isEmbeddedServerReady()) {
                    runOnUiThread(() -> {
                        if (destroyed || getBridge() == null) return;
                        getBridge().reload();
                        getBridge().getWebView().setVisibility(View.VISIBLE);
                    });
                    return;
                }
                SystemClock.sleep(250);
            }
        }, "DailyHealthServerWaiter").start();
    }

    private boolean isEmbeddedServerReady() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(LOCAL_HEALTH_URL).openConnection();
            connection.setConnectTimeout(500);
            connection.setReadTimeout(500);
            connection.setUseCaches(false);
            return connection.getResponseCode() == HttpURLConnection.HTTP_OK;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
