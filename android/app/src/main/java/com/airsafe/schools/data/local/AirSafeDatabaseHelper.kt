package com.airsafe.schools.data.local

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.airsafe.schools.data.model.DecisionResponse
import com.airsafe.schools.data.model.SensorSite
import com.airsafe.schools.data.model.UserSession
import com.airsafe.schools.util.AppLog
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * SQLite Database Helper for AirSafe Offline Telemetry & Snapshot Cache (F-07).
 * Provides authentic SQLite persistence for decision snapshots, user sessions,
 * and sensor sites during network disconnection and offline operation.
 */
class AirSafeDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val TAG = "AirSafeDB"
        private const val DATABASE_NAME = "airsafe_offline_cache.db"
        private const val DATABASE_VERSION = 1

        private const val TABLE_DECISIONS = "cached_decisions"
        private const val COL_SCHOOL_ID = "school_id"
        private const val COL_DECISION_JSON = "json_data"
        private const val COL_DECISION_STATUS = "status"
        private const val COL_DECISION_DECISION = "decision"
        private const val COL_DATA_AGE_MINS = "data_age_minutes"
        private const val COL_IS_STALE = "is_stale"
        private const val COL_UPDATED_AT = "updated_at_ms"

        private const val TABLE_SESSIONS = "cached_user_sessions"
        private const val COL_EMAIL = "email"
        private const val COL_SESSION_JSON = "json_data"

        private const val TABLE_SITES = "cached_sensor_sites"
        private const val COL_SITES_JSON = "json_data"

        @Volatile
        private var instance: AirSafeDatabaseHelper? = null

        fun getInstance(context: Context): AirSafeDatabaseHelper {
            return instance ?: synchronized(this) {
                instance ?: AirSafeDatabaseHelper(context.applicationContext).also { instance = it }
            }
        }
    }

    private val gson = Gson()

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_DECISIONS (
                $COL_SCHOOL_ID TEXT PRIMARY KEY,
                $COL_DECISION_JSON TEXT NOT NULL,
                $COL_DECISION_STATUS TEXT,
                $COL_DECISION_DECISION TEXT,
                $COL_DATA_AGE_MINS INTEGER,
                $COL_IS_STALE INTEGER DEFAULT 0,
                $COL_UPDATED_AT INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_SESSIONS (
                $COL_EMAIL TEXT PRIMARY KEY,
                $COL_SESSION_JSON TEXT NOT NULL,
                $COL_UPDATED_AT INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_SITES (
                $COL_SCHOOL_ID TEXT PRIMARY KEY,
                $COL_SITES_JSON TEXT NOT NULL,
                $COL_UPDATED_AT INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_DECISIONS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SESSIONS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SITES")
        onCreate(db)
    }

    /**
     * Persists authoritative or latest decision snapshot into SQLite table.
     */
    fun saveDecision(decision: DecisionResponse) {
        try {
            val json = gson.toJson(decision)
            val values = ContentValues().apply {
                put(COL_SCHOOL_ID, decision.schoolId)
                put(COL_DECISION_JSON, json)
                put(COL_DECISION_STATUS, decision.status)
                put(COL_DECISION_DECISION, decision.decision)
                put(COL_DATA_AGE_MINS, decision.dataAgeMinutes ?: 0)
                put(COL_IS_STALE, if (decision.isStale == true) 1 else 0)
                put(COL_UPDATED_AT, System.currentTimeMillis())
            }
            writableDatabase.insertWithOnConflict(
                TABLE_DECISIONS,
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            )
            AppLog.d(TAG, "Persisted decision for ${decision.schoolId} to SQLite.")
        } catch (e: Exception) {
            AppLog.e(TAG, "Error saving decision to SQLite: ${e.message}", e)
        }
    }

    /**
     * Retrieves cached decision snapshot from SQLite.
     */
    fun getDecision(schoolId: String): DecisionResponse? {
        var cursor: Cursor? = null
        return try {
            cursor = readableDatabase.query(
                TABLE_DECISIONS,
                arrayOf(COL_DECISION_JSON),
                "$COL_SCHOOL_ID = ?",
                arrayOf(schoolId),
                null,
                null,
                null
            )
            if (cursor != null && cursor.moveToFirst()) {
                val json = cursor.getString(0)
                gson.fromJson(json, DecisionResponse::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            AppLog.e(TAG, "Error reading decision from SQLite: ${e.message}", e)
            null
        } finally {
            cursor?.close()
        }
    }

    /**
     * Persists verified authenticated session into SQLite.
     */
    fun saveUserSession(session: UserSession) {
        try {
            val json = gson.toJson(session)
            val values = ContentValues().apply {
                put(COL_EMAIL, session.email.lowercase())
                put(COL_SESSION_JSON, json)
                put(COL_UPDATED_AT, System.currentTimeMillis())
            }
            writableDatabase.insertWithOnConflict(
                TABLE_SESSIONS,
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            )
            AppLog.d(TAG, "Persisted session for ${session.email} to SQLite.")
        } catch (e: Exception) {
            AppLog.e(TAG, "Error saving user session to SQLite: ${e.message}", e)
        }
    }

    /**
     * Retrieves cached user session from SQLite for offline login recovery.
     */
    fun getUserSession(email: String): UserSession? {
        var cursor: Cursor? = null
        return try {
            cursor = readableDatabase.query(
                TABLE_SESSIONS,
                arrayOf(COL_SESSION_JSON),
                "$COL_EMAIL = ?",
                arrayOf(email.lowercase()),
                null,
                null,
                null
            )
            if (cursor != null && cursor.moveToFirst()) {
                val json = cursor.getString(0)
                gson.fromJson(json, UserSession::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            AppLog.e(TAG, "Error reading user session from SQLite: ${e.message}", e)
            null
        } finally {
            cursor?.close()
        }
    }

    /**
     * Persists school sensor sites snapshot into SQLite.
     */
    fun saveSensorSites(schoolId: String, sites: List<SensorSite>) {
        try {
            val json = gson.toJson(sites)
            val values = ContentValues().apply {
                put(COL_SCHOOL_ID, schoolId)
                put(COL_SITES_JSON, json)
                put(COL_UPDATED_AT, System.currentTimeMillis())
            }
            writableDatabase.insertWithOnConflict(
                TABLE_SITES,
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            )
            AppLog.d(TAG, "Persisted ${sites.size} sensor sites for $schoolId to SQLite.")
        } catch (e: Exception) {
            AppLog.e(TAG, "Error saving sensor sites to SQLite: ${e.message}", e)
        }
    }

    /**
     * Retrieves cached sensor sites snapshot from SQLite.
     */
    fun getSensorSites(schoolId: String): List<SensorSite>? {
        var cursor: Cursor? = null
        return try {
            cursor = readableDatabase.query(
                TABLE_SITES,
                arrayOf(COL_SITES_JSON),
                "$COL_SCHOOL_ID = ?",
                arrayOf(schoolId),
                null,
                null,
                null
            )
            if (cursor != null && cursor.moveToFirst()) {
                val json = cursor.getString(0)
                val type = object : TypeToken<List<SensorSite>>() {}.type
                gson.fromJson(json, type)
            } else {
                null
            }
        } catch (e: Exception) {
            AppLog.e(TAG, "Error reading sensor sites from SQLite: ${e.message}", e)
            null
        } finally {
            cursor?.close()
        }
    }

    /**
     * Clears all cached tables on explicit logout.
     */
    fun clearAll() {
        try {
            writableDatabase.delete(TABLE_DECISIONS, null, null)
            writableDatabase.delete(TABLE_SESSIONS, null, null)
            writableDatabase.delete(TABLE_SITES, null, null)
            AppLog.d(TAG, "Cleared all SQLite cache tables.")
        } catch (e: Exception) {
            AppLog.e(TAG, "Error clearing SQLite cache tables: ${e.message}", e)
        }
    }
}
