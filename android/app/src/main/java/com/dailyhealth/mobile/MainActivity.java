package com.dailyhealth.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}

if (0 != (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE)) {
    WebView.setWebContentsDebuggingEnabled(true);
}
