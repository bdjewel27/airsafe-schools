package com.airsafe.schools.data.model

enum class UserRole {
    TEACHER,
    COORDINATOR,
    PLATFORM_ADMIN
}

data class UserSession(
    val email: String,
    val nameBn: String,
    val nameEn: String,
    val role: UserRole,
    val schoolId: String,
    val schoolNameBn: String,
    val schoolNameEn: String,
    val token: String? = null
)
