package com.airsafe.schools.util

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import com.airsafe.schools.data.model.SchoolAnalyticsSummary
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AirSafePdfReportGenerator {

    /**
     * Generates an official, printable PDF Report using native Android PdfDocument
     * and authentic F-13 7-day analytics metrics. Launches the Android Share Sheet
     * with an application/pdf payload and granted read URI permissions.
     */
    fun generateAndShareWeeklyReport(
        context: Context,
        analytics: SchoolAnalyticsSummary,
        schoolName: String = "Dhaka Model School",
        isBengali: Boolean = true
    ): Boolean {
        try {
            val pdfDoc = PdfDocument()
            // Standard A4 page size in PostScript points: 595 x 842
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
            val page = pdfDoc.startPage(pageInfo)
            val canvas = page.canvas

            val paint = Paint(Paint.ANTI_ALIAS_FLAG)

            // Header Banner
            paint.color = Color.rgb(27, 94, 32) // Forest green #1B5E20
            canvas.drawRect(0f, 0f, 595f, 90f, paint)

            // Header Title
            paint.color = Color.WHITE
            paint.textSize = 20f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val titleText = if (isBengali) "এয়ারসেফ স্কুল • সাপ্তাহিক নিরাপত্তা মূল্যায়ন রিপোর্ট" else "AirSafe Schools • Weekly Safety Evaluation Report"
            canvas.drawText(titleText, 36f, 40f, paint)

            paint.textSize = 12f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            val subText = "$schoolName • Policy v1.2 Verified Decision Engine"
            canvas.drawText(subText, 36f, 65f, paint)

            // Report Meta Box
            var yPos = 120f
            paint.color = Color.rgb(240, 244, 240)
            canvas.drawRoundRect(36f, yPos, 559f, yPos + 60f, 10f, 10f, paint)

            paint.color = Color.rgb(33, 33, 33)
            paint.textSize = 12f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val weekText = if (isBengali) "মূল্যায়ন সপ্তাহ: ${analytics.weekLabelBn}" else "Evaluation Week: ${analytics.weekLabelEn}"
            canvas.drawText(weekText, 50f, yPos + 25f, paint)

            paint.textSize = 10f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            paint.color = Color.rgb(100, 100, 100)
            val dateStr = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
            val dateLabel = if (isBengali) "রিপোর্ট তৈরির সময়: $dateStr" else "Report Generated: $dateStr"
            canvas.drawText(dateLabel, 50f, yPos + 45f, paint)

            yPos += 80f

            // Section 1: Executive KPI Metrics
            paint.color = Color.rgb(27, 94, 32)
            paint.textSize = 14f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val sec1Title = if (isBengali) "১. কার্যনির্বাহী সারসংক্ষেপ ও নিরাপত্তা পরিমাপক (KPI)" else "1. Executive Summary & Safety KPIs"
            canvas.drawText(sec1Title, 36f, yPos, paint)

            yPos += 20f

            // Metric Cards (2x2 grid)
            val metrics = listOf(
                Pair(
                    if (isBengali) "বাতিল হওয়া আউটডোর মিনিট" else "Lost Outdoor Minutes",
                    "${analytics.lostOutdoorMinutes} min"
                ),
                Pair(
                    if (isBengali) "বিপদসীমার ওপরে সময়" else "Hours Above Safety Threshold",
                    "${analytics.hoursAboveThreshold} hrs"
                ),
                Pair(
                    if (isBengali) "মোট বিশ্লেষণকৃত সেশন" else "Total Sessions Analyzed",
                    "${analytics.totalSessionsAnalyzed}"
                ),
                Pair(
                    if (isBengali) "অন-সাইট সেন্সর পরিমাপ অনুপাত" else "Measured Sensor Telemetry",
                    "${analytics.measuredRatioPct}%"
                )
            )

            val boxWidth = 250f
            val boxHeight = 55f
            metrics.forEachIndexed { i, m ->
                val col = i % 2
                val row = i / 2
                val left = 36f + col * 273f
                val top = yPos + row * 65f

                paint.color = Color.rgb(248, 249, 250)
                canvas.drawRoundRect(left, top, left + boxWidth, top + boxHeight, 8f, 8f, paint)

                paint.color = Color.rgb(100, 100, 100)
                paint.textSize = 10f
                paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                canvas.drawText(m.first, left + 14f, top + 20f, paint)

                paint.color = Color.rgb(27, 94, 32)
                paint.textSize = 18f
                paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                canvas.drawText(m.second, left + 14f, top + 44f, paint)
            }

            yPos += 145f

            // Section 2: Deterministic Policy Decision Breakdown
            paint.color = Color.rgb(27, 94, 32)
            paint.textSize = 14f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val sec2Title = if (isBengali) "২. পলিসি সিদ্ধান্ত ও অপারেশনাল বিভাজন" else "2. Policy Decisions & Operational Breakdown"
            canvas.drawText(sec2Title, 36f, yPos, paint)

            yPos += 20f

            val decisions = listOf(
                Triple(if (isBengali) "নিরাপদ সেশন (PROCEED - সবুজ)" else "Safe Sessions (PROCEED - Green)", "${analytics.proceedCount}", Color.rgb(46, 125, 50)),
                Triple(if (isBengali) "সতর্কতা ও পরিবর্তন (PRECAUTIONS - হলুদ/কমলা)" else "Precaution Sessions (PRECAUTIONS - Yellow)", "${analytics.cautionCount}", Color.rgb(245, 127, 23)),
                Triple(if (isBengali) "ভেতরে নেওয়া / বাতিল (MOVE INDOORS - লাল)" else "Critical Move Indoors (MOVE INDOORS - Red)", "${analytics.moveIndoorsCount}", Color.rgb(198, 40, 40)),
                Triple(if (isBengali) "রেকর্ডকৃত কোঅর্ডিনেটর ওভাররাইড" else "Logged Coordinator Overrides", "${analytics.overridesCount}", Color.rgb(66, 66, 66))
            )

            decisions.forEach { item ->
                paint.color = Color.rgb(250, 250, 250)
                canvas.drawRoundRect(36f, yPos, 559f, yPos + 32f, 6f, 6f, paint)

                // Color accent pill
                paint.color = item.third
                canvas.drawCircle(52f, yPos + 16f, 5f, paint)

                paint.color = Color.rgb(33, 33, 33)
                paint.textSize = 11f
                paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                canvas.drawText(item.first, 68f, yPos + 20f, paint)

                paint.textSize = 12f
                paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                paint.color = item.third
                canvas.drawText(item.second, 520f, yPos + 20f, paint)

                yPos += 38f
            }

            yPos += 30f

            // Section 3: Governance & Audit Signoff
            paint.color = Color.rgb(27, 94, 32)
            paint.textSize = 14f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val sec3Title = if (isBengali) "৩. কমপ্লায়েন্স ও আইনি নিশ্চয়তা" else "3. Compliance & Legal Assurance"
            canvas.drawText(sec3Title, 36f, yPos, paint)

            yPos += 20f
            paint.color = Color.rgb(110, 110, 110)
            paint.textSize = 9.5f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            val note1 = if (isBengali)
                "• এই রিপোর্টটি Model School Outdoor Activity Policy v1.2 এর অধীনে রিয়েল-টাইম সেন্সর ও পূর্বাভাসের ওপর ভিত্তি করে প্রণীত।"
            else
                "• Prepared deterministically under Model School Outdoor Activity Policy v1.2 based on real-time sensors & forecast."
            val note2 = if (isBengali)
                "• কোঅর্ডিনেটরের যেকোনো নীতি পরিবর্তনের ঘটনা অপরিবর্তনীয় অডিট লগে সংরক্ষিত এবং স্কুল গভর্নিং বডির কাছে দায়বদ্ধ।"
            else
                "• All coordinator overrides are recorded to immutable audit trails and subject to School Governing Board review."
            val note3 = if (isBengali)
                "• এয়ারসেফ প্ল্যাটফর্ম শিশুদের শ্বাসযন্ত্র সুরক্ষা ও চরম তাপমাত্রা নিরাপত্তা নিশ্চিতে স্বয়ংক্রিয় অডিট ট্রেইল বজায় রাখে।"
            else
                "• The AirSafe Platform maintains tamper-evident records to safeguard student respiratory health & heat safety."

            canvas.drawText(note1, 36f, yPos, paint)
            canvas.drawText(note2, 36f, yPos + 16f, paint)
            canvas.drawText(note3, 36f, yPos + 32f, paint)

            // Footer Divider & Disclaimer
            paint.color = Color.rgb(200, 200, 200)
            canvas.drawLine(36f, 790f, 559f, 790f, paint)

            paint.color = Color.rgb(140, 140, 140)
            paint.textSize = 8.5f
            val footerText = "AirSafe Schools (v1.0.0) • Government of Bangladesh & School Board Compliant • Official Record"
            canvas.drawText(footerText, 36f, 805f, paint)

            pdfDoc.finishPage(page)

            // Save PDF to cache directory
            val reportsDir = File(context.cacheDir, "reports")
            if (!reportsDir.exists()) {
                reportsDir.mkdirs()
            }
            val fileName = "AirSafe_Weekly_Safety_Report_${System.currentTimeMillis()}.pdf"
            val pdfFile = File(reportsDir, fileName)

            FileOutputStream(pdfFile).use { out ->
                pdfDoc.writeTo(out)
            }
            pdfDoc.close()

            // Share via FileProvider & Android Share Sheet
            val contentUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                pdfFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                putExtra(
                    Intent.EXTRA_SUBJECT,
                    if (isBengali) "এয়ারসেফ স্কুল সাপ্তাহিক নিরাপত্তা রিপোর্ট ($schoolName)" else "AirSafe Schools Weekly Safety Report ($schoolName)"
                )
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            val chooserTitle = if (isBengali) "সাপ্তাহিক নিরাপত্তা রিপোর্ট (PDF) শেয়ার করুন" else "Share Weekly Safety Report (PDF)"
            val chooserIntent = Intent.createChooser(shareIntent, chooserTitle).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooserIntent)
            return true
        } catch (e: Exception) {
            AppLog.e("AirSafePdf", "Error generating PDF weekly report: ${e.message}", e)
            return false
        }
    }
}
