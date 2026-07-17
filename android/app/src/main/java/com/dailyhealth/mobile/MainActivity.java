package com.dailyhealth.mobile;

import android.os.Bundle;
import android.os.SystemClock;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String LOCAL_HEALTH_URL = "http://127.0.0.1:34189/api/health";
    private static final String LOCAL_SERVER_ORIGIN = "http://127.0.0.1:34189";
    private static final long STARTUP_TIMEOUT_MS = 45000;
    private volatile boolean destroyed = false;
    private LocalNodeProxyWebViewClient nodeProxy;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CapacitorSQLitePlugin.class);
        super.onCreate(savedInstanceState);
        nodeProxy = new LocalNodeProxyWebViewClient();
        getBridge().setWebViewClient(nodeProxy);
        waitForEmbeddedServer();
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        super.onDestroy();
    }

    private void waitForEmbeddedServer() {
        new Thread(() -> {
            final long deadline = SystemClock.elapsedRealtime() + STARTUP_TIMEOUT_MS;
            while (!destroyed && !isFinishing()) {
                if (isEmbeddedServerReady()) {
                    runOnUiThread(() -> {
                        if (destroyed || getBridge() == null) return;
                        nodeProxy.setReady();
                        getBridge().reload();
                    });
                    return;
                }
                if (SystemClock.elapsedRealtime() >= deadline) {
                    runOnUiThread(this::showStartupFailure);
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

    private void showStartupFailure() {
        if (destroyed || getBridge() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "window.dailyHealthStartupFailed && window.dailyHealthStartupFailed(" +
            "'The local health service did not start. Close Daily Health and open it again. If it repeats, reinstall this APK and send the app log.'" +
            ");",
            null
        );
    }

    /**
     * Capacitor only guarantees the native bridge on its own https://localhost
     * origin. Keep that URL visible to the WebView and proxy the app content to
     * the embedded HTTP server instead of navigating the document to it.
     */
    private final class LocalNodeProxyWebViewClient extends BridgeWebViewClient {
        private volatile boolean ready = false;

        private LocalNodeProxyWebViewClient() {
            super(MainActivity.this.getBridge());
        }

        private void setReady() {
            ready = true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!ready || !shouldProxy(request.getUrl())) {
                return super.shouldInterceptRequest(view, request);
            }

            WebResourceResponse response = proxy(request);
            return response != null ? response : super.shouldInterceptRequest(view, request);
        }

        private boolean shouldProxy(Uri url) {
            if (url == null || !"https".equalsIgnoreCase(url.getScheme()) || !"localhost".equalsIgnoreCase(url.getHost())) {
                return false;
            }

            String path = url.getPath();
            return path == null || (!path.startsWith("/_capacitor_") && !"/capacitor.js".equals(path));
        }

        private WebResourceResponse proxy(WebResourceRequest request) {
            HttpURLConnection connection = null;
            try {
                Uri requestUrl = request.getUrl();
                String path = requestUrl.getEncodedPath();
                String query = requestUrl.getEncodedQuery();
                String target = LOCAL_SERVER_ORIGIN + (path == null || path.isEmpty() ? "/" : path) + (query == null ? "" : "?" + query);

                connection = (HttpURLConnection) new URL(target).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(2500);
                connection.setReadTimeout(30000);
                connection.setRequestMethod(request.getMethod());
                connection.setRequestProperty("Accept-Encoding", "identity");

                for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                    String name = header.getKey();
                    if (name == null || shouldSkipRequestHeader(name)) continue;
                    connection.setRequestProperty(name, header.getValue());
                }

                int status = connection.getResponseCode();
                InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (body == null) body = new ByteArrayInputStream(new byte[0]);
                byte[] content = readBody(body);
                return new WebResourceResponse(
                    mimeType(connection.getContentType(), requestUrl.getPath()),
                    encoding(connection.getContentType()),
                    status,
                    reasonPhrase(connection.getResponseMessage(), status),
                    responseHeaders(connection.getHeaderFields()),
                    new ByteArrayInputStream(content)
                );
            } catch (Exception error) {
                return startupProxyError();
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        private boolean shouldSkipRequestHeader(String name) {
            String normalized = name.toLowerCase();
            return normalized.equals("host") || normalized.equals("connection") || normalized.equals("content-length") || normalized.equals("accept-encoding");
        }

        private byte[] readBody(InputStream stream) throws java.io.IOException {
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
                return output.toByteArray();
            }
        }

        private String mimeType(String contentType, String path) {
            if (contentType != null && !contentType.trim().isEmpty()) {
                return contentType.split(";", 2)[0].trim();
            }
            String guessed = java.net.URLConnection.guessContentTypeFromName(path);
            return guessed != null ? guessed : "application/octet-stream";
        }

        private String encoding(String contentType) {
            if (contentType != null) {
                String[] parts = contentType.split(";");
                for (String part : parts) {
                    String trimmed = part.trim();
                    if (trimmed.regionMatches(true, 0, "charset=", 0, 8)) {
                        return trimmed.substring(8).replace("\"", "");
                    }
                }
            }
            return StandardCharsets.UTF_8.name();
        }

        private Map<String, String> responseHeaders(Map<String, List<String>> source) {
            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> entry : source.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isEmpty()) continue;
                headers.put(entry.getKey(), entry.getValue().get(0));
            }
            return headers;
        }

        private String reasonPhrase(String value, int status) {
            return value == null || value.trim().isEmpty() ? "HTTP " + status : value;
        }

        private WebResourceResponse startupProxyError() {
            byte[] content = "<html><body><h2>Daily Health local service is unavailable.</h2><p>Close the app and open it again.</p></body></html>".getBytes(StandardCharsets.UTF_8);
            return new WebResourceResponse("text/html", "UTF-8", 503, "Local service unavailable", new HashMap<>(), new ByteArrayInputStream(content));
        }
    }
}
