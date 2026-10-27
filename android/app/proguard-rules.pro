# ProGuard / R8 Rules for AirSafe Schools

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Gson Serialization & Data Models
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.airsafe.schools.data.model.** { *; }
-keep class com.airsafe.schools.data.api.** { *; }
-keep class com.airsafe.schools.ui.viewmodel.** { *; }

# Retrofit 2 & OkHttp 3 / Okio
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Exceptions
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**
-keep class kotlinx.coroutines.** { *; }

# AndroidX & Jetpack Compose
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**
