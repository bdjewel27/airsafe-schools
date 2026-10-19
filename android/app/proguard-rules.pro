# ProGuard / R8 Rules for AirSafe Schools
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
