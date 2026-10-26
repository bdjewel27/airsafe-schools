plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.airsafe.schools"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.airsafe.schools"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "LAN_BASE_URL", "\"\"")
        buildConfigField("String", "USB_BASE_URL", "\"\"")
    }

    val keystorePassword = System.getenv("AIRSAFE_KEYSTORE_PASSWORD")
        ?: (project.findProperty("AIRSAFE_KEYSTORE_PASSWORD") as String?)
    val keyPassword = System.getenv("AIRSAFE_KEY_PASSWORD")
        ?: (project.findProperty("AIRSAFE_KEY_PASSWORD") as String?)
    val keyAlias = System.getenv("AIRSAFE_KEY_ALIAS")
        ?: (project.findProperty("AIRSAFE_KEY_ALIAS") as String?)
        ?: "airsafe"

    val hasReleaseSigning = !keystorePassword.isNullOrBlank() && !keyPassword.isNullOrBlank()

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file("airsafe-release.jks")
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "LAN_BASE_URL", "\"http://192.168.31.37:3000/\"")
            buildConfigField("String", "USB_BASE_URL", "\"http://127.0.0.1:3000/\"")
        }
        release {
            buildConfigField("String", "LAN_BASE_URL", "\"\"")
            buildConfigField("String", "USB_BASE_URL", "\"\"")
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    gradle.taskGraph.whenReady {
        val isReleaseRequested = allTasks.any { task ->
            task.name.contains("Release", ignoreCase = true) && !task.name.contains("Test", ignoreCase = true)
        }
        if (isReleaseRequested && !hasReleaseSigning) {
            throw GradleException(
                "FAIL-CLOSED (Hard Gate 1): AIRSAFE_KEYSTORE_PASSWORD and AIRSAFE_KEY_PASSWORD environment variables or project properties are required for release build."
            )
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // Core Android & Lifecycle
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Jetpack Compose & Material 3
    implementation(platform("androidx.compose:compose-bom:2024.11.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Networking (Retrofit & OkHttp)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Firebase Cloud Messaging (F-06: Background Push & Alert Delivery)
    implementation("com.google.firebase:firebase-messaging:24.1.0")

    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.11.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
