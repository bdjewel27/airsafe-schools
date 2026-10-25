package com.airsafe.schools.util

import android.util.Log
import com.airsafe.schools.BuildConfig

/**
 * Security-hardened logger (S6).
 * In release builds (BuildConfig.DEBUG == false), all logging to logcat is completely silenced.
 * In debug builds, emails and Bearer tokens are automatically masked to prevent PII/credential leakage.
 */
object AppLog {
    private val EMAIL_REGEX = Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}")
    private val TOKEN_REGEX = Regex("Bearer\\s+[A-Za-z0-9-_=]+(\\.[A-Za-z0-9-_=]+)+")

    fun d(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(tag, sanitize(message))
        }
    }

    fun i(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.i(tag, sanitize(message))
        }
    }

    fun w(tag: String, message: String, tr: Throwable? = null) {
        if (BuildConfig.DEBUG) {
            if (tr != null) Log.w(tag, sanitize(message), tr) else Log.w(tag, sanitize(message))
        }
    }

    fun e(tag: String, message: String, tr: Throwable? = null) {
        if (BuildConfig.DEBUG) {
            if (tr != null) Log.e(tag, sanitize(message), tr) else Log.e(tag, sanitize(message))
        }
    }

    private fun sanitize(msg: String): String {
        return msg
            .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
            .replace(TOKEN_REGEX, "Bearer [REDACTED_TOKEN]")
    }
}
