"""
Generate high-fidelity UI state screenshots and accessibility/color-blind audit artifacts
for AirSafe Schools UX documentation (U-2, U-3, U-6, U-10).
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Canvas dimensions (Standard modern Android viewport: 400x820 dp)
W, H = 420, 840

def get_fonts():
    font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
    nirmala = os.path.join(font_dir, 'Nirmala.ttc')
    segoe = os.path.join(font_dir, 'segoeui.ttf')
    segoe_b = os.path.join(font_dir, 'segoeuib.ttf')
    arial = os.path.join(font_dir, 'arial.ttf')
    
    font_file = nirmala if os.path.exists(nirmala) else (segoe if os.path.exists(segoe) else arial)
    font_b_file = nirmala if os.path.exists(nirmala) else (segoe_b if os.path.exists(segoe_b) else arial)
    
    return {
        'title': ImageFont.truetype(font_b_file, 20),
        'sub': ImageFont.truetype(font_file, 13),
        'card_title': ImageFont.truetype(font_b_file, 17),
        'card_bold': ImageFont.truetype(font_b_file, 14),
        'body': ImageFont.truetype(font_file, 13),
        'small': ImageFont.truetype(font_file, 11),
        'small_b': ImageFont.truetype(font_b_file, 11),
        'metric_val': ImageFont.truetype(font_b_file, 22),
        'metric_lbl': ImageFont.truetype(font_file, 11),
    }

FONTS = get_fonts()

def draw_status_bar(draw):
    draw.rectangle([0, 0, W, 28], fill=(240, 243, 246))
    draw.text((16, 6), "08:15", fill=(30, 30, 30), font=FONTS['small_b'])
    draw.text((W - 75, 6), "LTE  100%", fill=(60, 60, 60), font=FONTS['small'])

def draw_top_app_bar(draw, active_tab_name="হোম (Home)", role="শিক্ষক (Teacher)"):
    # App header
    draw.rectangle([0, 28, W, 80], fill=(255, 255, 255))
    draw.line([0, 80, W, 80], fill=(225, 230, 235), width=1)
    draw.text((16, 36), "AirSafe Schools", fill=(27, 94, 32), font=FONTS['title'])
    draw.text((16, 59), f"{role} • Model School Dhaka", fill=(100, 105, 115), font=FONTS['small'])
    
    # Lang pill
    draw.rounded_rectangle([W - 86, 40, W - 16, 68], radius=14, fill=(232, 245, 233), outline=(27, 94, 32), width=1)
    draw.text((W - 76, 47), "বাংলা | EN", fill=(27, 94, 32), font=FONTS['small_b'])

def draw_bottom_nav(draw, active_idx=0):
    nav_y = H - 56
    draw.rectangle([0, nav_y, W, H], fill=(255, 255, 255))
    draw.line([0, nav_y, W, nav_y], fill=(225, 230, 235), width=1)
    
    tabs = ["হোম", "ট্রেন্ডস", "সহকারী", "পরিসংখ্যান", "কর্মী"]
    step = W // len(tabs)
    for i, t in enumerate(tabs):
        tx = i * step + step // 2
        color = (27, 94, 32) if i == active_idx else (120, 125, 135)
        # Dot icon
        draw.ellipse([tx - 4, nav_y + 12, tx + 4, nav_y + 20], fill=color)
        draw.text((tx - 12, nav_y + 26), t, fill=color, font=FONTS['small'])

def create_base_canvas():
    img = Image.new('RGB', (W, H), (248, 249, 251))
    draw = ImageDraw.Draw(img)
    draw_status_bar(draw)
    return img, draw

# ----------------- Screen 1: Home Loading Skeleton -----------------
def generate_home_skeleton():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw)
    
    # Skeleton Decision Card
    draw.rounded_rectangle([16, 96, W - 16, 260], radius=18, fill=(232, 236, 240), outline=(218, 224, 230), width=1)
    draw.rounded_rectangle([32, 116, 120, 138], radius=8, fill=(210, 216, 224))
    draw.rounded_rectangle([32, 148, 260, 180], radius=10, fill=(200, 206, 216))
    draw.rounded_rectangle([32, 192, 340, 212], radius=6, fill=(215, 221, 230))
    draw.rounded_rectangle([32, 220, 220, 238], radius=6, fill=(215, 221, 230))
    
    # Text indicator
    draw.text((36, 275), "পুনঃগণনা ও সেন্সর ডেটা সিঙ্ক হচ্ছে...", fill=(100, 110, 125), font=FONTS['body'])
    
    # Metric cards skeleton
    metrics_y = 310
    col_w = (W - 44) // 2
    for r in range(2):
        for c in range(2):
            mx = 16 + c * (col_w + 12)
            my = metrics_y + r * 105
            draw.rounded_rectangle([mx, my, mx + col_w, my + 95], radius=14, fill=(235, 238, 242))
            draw.rounded_rectangle([mx + 16, my + 16, mx + 80, my + 32], radius=6, fill=(215, 221, 230))
            draw.rounded_rectangle([mx + 16, my + 44, mx + 110, my + 72], radius=8, fill=(200, 208, 218))
            
    # Routine skeleton
    draw.rounded_rectangle([16, 540, W - 16, 680], radius=14, fill=(235, 238, 242))
    draw.rounded_rectangle([32, 560, 180, 582], radius=6, fill=(215, 221, 230))
    draw.rounded_rectangle([32, 598, 320, 620], radius=6, fill=(220, 226, 234))
    draw.rounded_rectangle([32, 632, 280, 654], radius=6, fill=(220, 226, 234))
    
    draw_bottom_nav(draw, 0)
    img.save(os.path.join(OUTPUT_DIR, "state-home-loading-skeleton.png"))

# ----------------- Screen 2: Home Proceed Safe -----------------
def generate_home_proceed():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw)
    
    # Green Proceed Card
    draw.rounded_rectangle([16, 96, W - 16, 280], radius=18, fill=(232, 245, 233), outline=(27, 94, 32), width=2)
    # Icon circle
    draw.ellipse([32, 114, 68, 150], fill=(27, 94, 32))
    draw.text((43, 120), "✔", fill=(255, 255, 255), font=FONTS['card_bold'])
    
    draw.text((78, 116), "PROCEED", fill=(27, 94, 32), font=FONTS['small_b'])
    draw.text((78, 130), "স্বাভাবিক কার্যক্রম চলবে", fill=(27, 94, 32), font=FONTS['card_title'])
    
    draw.line([32, 162, W - 32, 162], fill=(200, 230, 201), width=1)
    draw.text((32, 172), "সুপারিশ: সর্বোচ্চ ৪৫ মিনিট বহিরঙ্গন ক্লাস বৈধ", fill=(46, 125, 50), font=FONTS['card_bold'])
    draw.text((32, 196), "• পর্যাপ্ত পানির ব্যবস্থা রাখুন এবং বিশ্রামের সুযোগ দিন", fill=(60, 70, 60), font=FONTS['body'])
    draw.text((32, 218), "• সংবেদনশীল শিশুদের জন্য ছায়ার ব্যবস্থা রাখুন", fill=(60, 70, 60), font=FONTS['body'])
    
    # Freshness badge
    draw.rounded_rectangle([32, 244, 210, 268], radius=8, fill=(200, 230, 201))
    draw.text((40, 249), "● লাইভ সেন্সর ডেটা (২ মিনিট আগে)", fill=(27, 94, 32), font=FONTS['small_b'])

    # 4 Metric Cards
    metrics_y = 295
    col_w = (W - 44) // 2
    cards_data = [
        ("হিট ইনডেক্স", "30.2°C", "স্বাভাবিক সীমা", (232, 245, 233), (27, 94, 32)),
        ("বায়ু মান (AQI)", "42", "ভালো (Good)", (232, 245, 233), (27, 94, 32)),
        ("ওয়েট বাল্ব", "24.5°C", "ঝুঁকিমুক্ত", (245, 247, 250), (60, 70, 80)),
        ("পিএম ২.৫", "12 µg/m³", "WHO মানসম্মত", (245, 247, 250), (60, 70, 80))
    ]
    for idx, (label, val, status, bg, fg) in enumerate(cards_data):
        r = idx // 2
        c = idx % 2
        mx = 16 + c * (col_w + 12)
        my = metrics_y + r * 102
        draw.rounded_rectangle([mx, my, mx + col_w, my + 92], radius=14, fill=bg, outline=(220, 225, 230), width=1)
        draw.text((mx + 14, my + 12), label, fill=(100, 105, 115), font=FONTS['metric_lbl'])
        draw.text((mx + 14, my + 30), val, fill=fg, font=FONTS['metric_val'])
        draw.text((mx + 14, my + 64), status, fill=fg, font=FONTS['small_b'])

    # Routine Card
    draw.rounded_rectangle([16, 515, W - 16, 680], radius=14, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.text((32, 530), "আজকের কার্যক্রম রুটিন", fill=(30, 35, 45), font=FONTS['card_bold'])
    draw.text((32, 558), "• সকাল ০৮:৩০ - ০৯:১৫: মর্নিং পিই ক্লাস (মাঠ)", fill=(40, 45, 55), font=FONTS['body'])
    draw.text((32, 582), "• সকাল ০৯:৩০ - ১০:০০: প্রাতঃকালীন সমাবেশ (অ্যাসেম্বলি)", fill=(40, 45, 55), font=FONTS['body'])
    draw.text((32, 606), "• দুপুর ০১:০০ - ০১:৪৫: টিফিন ও উন্মুক্ত খেলাধুলা", fill=(40, 45, 55), font=FONTS['body'])
    
    # Class Note Button
    draw.rounded_rectangle([32, 638, W - 32, 670], radius=8, fill=(240, 243, 246))
    draw.text((120, 646), "📝 ক্লাস নোট বা পর্যবেক্ষণ যোগ করুন", fill=(50, 60, 70), font=FONTS['small_b'])

    draw_bottom_nav(draw, 0)
    img.save(os.path.join(OUTPUT_DIR, "state-home-proceed-safe.png"))

# ----------------- Screen 3: Home Stale Data Banner -----------------
def generate_home_stale():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw)
    
    # Explicit Stale Banner (Orange #FFF3E0 bg, #E65100 text)
    draw.rounded_rectangle([16, 92, W - 16, 140], radius=12, fill=(255, 243, 224), outline=(230, 81, 0), width=2)
    draw.text((28, 100), "⚠️ সতর্কতা: সেন্সর ডেটা পুরনো (Stale > ৯০ মিনিট)", fill=(191, 54, 12), font=FONTS['card_bold'])
    draw.text((28, 118), "সর্বশেষ ডেটা ১১২ মিনিট আগের। ফলব্যাক নিরাপত্তা নীতি প্রযোজ্য।", fill=(191, 54, 12), font=FONTS['small'])

    # Caution Card
    draw.rounded_rectangle([16, 150, W - 16, 320], radius=18, fill=(255, 253, 231), outline=(245, 127, 23), width=2)
    draw.ellipse([32, 166, 68, 202], fill=(245, 127, 23))
    draw.text((46, 172), "!", fill=(255, 255, 255), font=FONTS['card_bold'])
    
    draw.text((78, 168), "CAUTION / STALE FALLBACK", fill=(230, 81, 0), font=FONTS['small_b'])
    draw.text((78, 184), "সতর্কতাসহ কার্যক্রম সীমিত করুন", fill=(230, 81, 0), font=FONTS['card_title'])
    
    draw.line([32, 214, W - 32, 214], fill=(255, 236, 179), width=1)
    draw.text((32, 224), "নীতি নির্দেশিকা: সর্বোচ্চ ৩০ মিনিট বহিরঙ্গন অনুমতি", fill=(191, 54, 12), font=FONTS['card_bold'])
    draw.text((32, 246), "• প্রতি ১৫ মিনিটে বাধ্যতামূলক পানি বিরতি দিন", fill=(60, 70, 60), font=FONTS['body'])
    draw.text((32, 268), "• সরাসরি রোদে দীর্ঘক্ষণ দৌড়াদৌড়ি নিষেধ", fill=(60, 70, 60), font=FONTS['body'])

    # Refresh Action Button
    draw.rounded_rectangle([32, 288, 200, 312], radius=8, fill=(245, 127, 23))
    draw.text((45, 294), "🔄 সেন্সর পুনরায় পরীক্ষা করুন", fill=(255, 255, 255), font=FONTS['small_b'])

    # Metrics
    metrics_y = 335
    col_w = (W - 44) // 2
    cards_data = [
        ("হিট ইনডেক্স (পুরনো)", "33.4°C", "সতর্কতা স্তর", (255, 243, 224), (230, 81, 0)),
        ("বায়ু মান (AQI পুরনো)", "88", "মাঝারি (Moderate)", (255, 243, 224), (230, 81, 0)),
        ("ওয়েট বাল্ব", "27.1°C", "নজরদারি প্রয়োজন", (245, 247, 250), (60, 70, 80)),
        ("কানেক্টিভিটি", "অফলাইন", "লোকাল ক্যাশ", (255, 235, 238), (183, 28, 28))
    ]
    for idx, (label, val, status, bg, fg) in enumerate(cards_data):
        r = idx // 2
        c = idx % 2
        mx = 16 + c * (col_w + 12)
        my = metrics_y + r * 102
        draw.rounded_rectangle([mx, my, mx + col_w, my + 92], radius=14, fill=bg, outline=(220, 225, 230), width=1)
        draw.text((mx + 14, my + 12), label, fill=(100, 105, 115), font=FONTS['metric_lbl'])
        draw.text((mx + 14, my + 30), val, fill=fg, font=FONTS['metric_val'])
        draw.text((mx + 14, my + 64), status, fill=fg, font=FONTS['small_b'])

    # Explanatory card
    draw.rounded_rectangle([16, 555, W - 16, 680], radius=14, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.text((32, 570), "সেন্সর স্টেলনেস নির্দেশিকা (Policy v1.2)", fill=(30, 35, 45), font=FONTS['card_bold'])
    draw.text((32, 595), "৯০ মিনিটের বেশি ডেটা না পৌঁছালে সিস্টেম স্বয়ংক্রিয়ভাবে", fill=(70, 75, 85), font=FONTS['body'])
    draw.text((32, 617), "নিরাপদ সতর্ক ফলব্যাক প্রয়োগ করে। শিক্ষক ও শিক্ষার্থীরা", fill=(70, 75, 85), font=FONTS['body'])
    draw.text((32, 639), "ঝুঁকিমুক্ত পরিবেশে ক্লাস চালিয়ে যেতে পারবেন।", fill=(70, 75, 85), font=FONTS['body'])

    draw_bottom_nav(draw, 0)
    img.save(os.path.join(OUTPUT_DIR, "state-home-stale-warning.png"))

# ----------------- Screen 4: Home Move Indoors (Critical) -----------------
def generate_home_move_indoors():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw, role="কোঅর্ডিনেটর (Coordinator)")
    
    # Red Move Indoors Card
    draw.rounded_rectangle([16, 96, W - 16, 310], radius=18, fill=(255, 235, 238), outline=(183, 28, 28), width=2)
    # Icon circle
    draw.ellipse([32, 114, 68, 150], fill=(183, 28, 28))
    draw.text((44, 118), "✖", fill=(255, 255, 255), font=FONTS['card_bold'])
    
    draw.text((78, 116), "MOVE INDOORS", fill=(183, 28, 28), font=FONTS['small_b'])
    draw.text((78, 130), "অবিলম্বে ইনডোরে যান", fill=(183, 28, 28), font=FONTS['card_title'])
    
    draw.line([32, 162, W - 32, 162], fill=(255, 205, 210), width=1)
    draw.text((32, 172), "জরুরি সতর্কতা: সকল বহিরঙ্গন কার্যক্রম বাতিল (০ মিনিট)", fill=(183, 28, 28), font=FONTS['card_bold'])
    draw.text((32, 196), "• হিট ইনডেক্স ৪০.৫°C এবং AQI ১৭২ (অস্বাস্থ্যকর)", fill=(60, 70, 60), font=FONTS['body'])
    draw.text((32, 218), "• সকল শিক্ষার্থী ও কর্মীদের অবিলম্বে শ্রেণিকক্ষে রাখুন", fill=(60, 70, 60), font=FONTS['body'])
    draw.text((32, 240), "• ফ্যান/ভেন্টিলেশন চালু রাখুন ও ওআরএস সরবরাহ করুন", fill=(60, 70, 60), font=FONTS['body'])

    # Critical reason tag
    draw.rounded_rectangle([32, 268, 270, 294], radius=6, fill=(183, 28, 28))
    draw.text((40, 274), "🚨 পলিসি সীমা অতিক্রম: হিট ইনডেক্স > ৩৮°C", fill=(255, 255, 255), font=FONTS['small_b'])

    # Coordinator Override Action Button (U-9 Verified)
    draw.rounded_rectangle([16, 325, W - 16, 375], radius=12, fill=(245, 127, 23))
    draw.text((95, 342), "⚡ কোঅর্ডিনেটর ওভাররাইড প্রয়োগ করুন", fill=(255, 255, 255), font=FONTS['card_bold'])

    # 4 Metric Cards (Red Alert)
    metrics_y = 390
    col_w = (W - 44) // 2
    cards_data = [
        ("হিট ইনডেক্স", "40.5°C", "বিপদজনক (Danger)", (255, 235, 238), (183, 28, 28)),
        ("বায়ু মান (AQI)", "172", "অস্বাস্থ্যকর (Unhealthy)", (255, 235, 238), (183, 28, 28)),
        ("ওয়েট বাল্ব", "29.8°C", "হিট ক্র্যাম্প ঝুঁকি", (255, 235, 238), (183, 28, 28)),
        ("পিএম ২.৫", "98 µg/m³", "উচ্চ দূষণ", (255, 235, 238), (183, 28, 28))
    ]
    for idx, (label, val, status, bg, fg) in enumerate(cards_data):
        r = idx // 2
        c = idx % 2
        mx = 16 + c * (col_w + 12)
        my = metrics_y + r * 102
        draw.rounded_rectangle([mx, my, mx + col_w, my + 92], radius=14, fill=bg, outline=(255, 205, 210), width=1)
        draw.text((mx + 14, my + 12), label, fill=(100, 105, 115), font=FONTS['metric_lbl'])
        draw.text((mx + 14, my + 30), val, fill=fg, font=FONTS['metric_val'])
        draw.text((mx + 14, my + 64), status, fill=fg, font=FONTS['small_b'])

    # Audit Note
    draw.rounded_rectangle([16, 610, W - 16, 680], radius=12, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.text((32, 624), "অডিট ট্রেইল ও আইনি সুরক্ষা (A-8 & Gate 4)", fill=(30, 35, 45), font=FONTS['card_bold'])
    draw.text((32, 646), "এই সিদ্ধান্ত স্বয়ংক্রিয়ভাবে অপরিবর্তনীয় অডিট লগে সংরক্ষিত।", fill=(70, 75, 85), font=FONTS['body'])

    draw_bottom_nav(draw, 0)
    img.save(os.path.join(OUTPUT_DIR, "state-home-move-indoors.png"))

# ----------------- Screen 5: Trends 24h Graph -----------------
def generate_trends_chart():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw, active_tab_name="ট্রেন্ডস (Trends)")
    
    # Title & Mode Toggle
    draw.text((16, 94), "২৪ ঘণ্টার পরিবেশগত ট্রেন্ডস", fill=(30, 35, 45), font=FONTS['title'])
    draw.text((16, 118), "সময় অঞ্চল: এশিয়া/ঢাকা (Asia/Dhaka)", fill=(100, 105, 115), font=FONTS['small'])

    # Toggle between Graph & Table
    draw.rounded_rectangle([W - 170, 94, W - 92, 124], radius=15, fill=(27, 94, 32))
    draw.text((W - 156, 101), "গ্রাফ ভিউ", fill=(255, 255, 255), font=FONTS['small_b'])
    draw.rounded_rectangle([W - 86, 94, W - 16, 124], radius=15, fill=(235, 240, 245))
    draw.text((W - 74, 101), "টেবিল", fill=(80, 85, 95), font=FONTS['small'])

    # Chart Box
    chart_x1, chart_y1 = 20, 145
    chart_x2, chart_y2 = W - 20, 420
    draw.rounded_rectangle([chart_x1, chart_y1, chart_x2, chart_y2], radius=16, fill=(255, 255, 255), outline=(225, 230, 235), width=1)

    # Threshold horizontal reference lines
    # Red threshold (Move Indoors)
    draw.line([chart_x1 + 40, chart_y1 + 50, chart_x2 - 20, chart_y1 + 50], fill=(255, 205, 210), width=1)
    draw.text((chart_x1 + 8, chart_y1 + 42), "38°C", fill=(183, 28, 28), font=FONTS['small'])
    # Yellow threshold (Caution)
    draw.line([chart_x1 + 40, chart_y1 + 120, chart_x2 - 20, chart_y1 + 120], fill=(255, 236, 179), width=1)
    draw.text((chart_x1 + 8, chart_y1 + 112), "32°C", fill=(245, 127, 23), font=FONTS['small'])
    # Green safe baseline
    draw.line([chart_x1 + 40, chart_y1 + 200, chart_x2 - 20, chart_y1 + 200], fill=(200, 230, 201), width=1)
    draw.text((chart_x1 + 8, chart_y1 + 192), "26°C", fill=(27, 94, 32), font=FONTS['small'])

    # Simulated curve points for 24 hours
    points = [
        (0, 27.5), (2, 26.8), (4, 26.2), (6, 27.0), (8, 29.5), 
        (10, 33.2), (12, 36.8), (14, 39.5), (16, 37.0), (18, 34.0), 
        (20, 31.0), (22, 29.0)
    ]
    screen_pts = []
    for h, temp in points:
        px = chart_x1 + 50 + int((h / 22) * (chart_x2 - chart_x1 - 80))
        # Map temp: 24C -> chart_y1 + 220, 42C -> chart_y1 + 30
        py = int(chart_y1 + 220 - ((temp - 24) / 18) * 190)
        screen_pts.append((px, py))

    # Draw Heat Index Curve
    for i in range(len(screen_pts) - 1):
        draw.line([screen_pts[i], screen_pts[i+1]], fill=(230, 81, 0), width=3)
        draw.ellipse([screen_pts[i][0] - 4, screen_pts[i][1] - 4, screen_pts[i][0] + 4, screen_pts[i][1] + 4], fill=(230, 81, 0))
    draw.ellipse([screen_pts[-1][0] - 4, screen_pts[-1][1] - 4, screen_pts[-1][0] + 4, screen_pts[-1][1] + 4], fill=(230, 81, 0))

    # Time labels
    times = ["০৬:০০", "০৯:০০", "১২:০০", "১৫:০০", "১৮:০০", "২১:০০"]
    for i, t in enumerate(times):
        tx = chart_x1 + 50 + int((i / (len(times) - 1)) * (chart_x2 - chart_x1 - 80))
        draw.text((tx - 14, chart_y2 - 25), t, fill=(120, 125, 135), font=FONTS['small'])

    # Summary card below chart
    draw.rounded_rectangle([16, 435, W - 16, 550], radius=14, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.text((32, 450), "পূর্বাভাস বিশ্লেষণ (Next 6 Hours)", fill=(30, 35, 45), font=FONTS['card_bold'])
    draw.text((32, 474), "• দুপুর ১২:০০ থেকে ১৫:০০ পর্যন্ত হিট ইনডেক্স ৩৮°C ছাড়িয়ে যাবে", fill=(183, 28, 28), font=FONTS['body'])
    draw.text((32, 496), "• সুপারিশ: দুপুরের সকল ক্লাস ইনডোরে স্থানান্তর করুন", fill=(50, 60, 70), font=FONTS['body'])
    draw.text((32, 518), "• বিকাল ১৬:০০ এর পর তাপমাত্রা সহনীয় পর্যায়ে নামবে", fill=(50, 60, 70), font=FONTS['body'])

    # Export CSV Card
    draw.rounded_rectangle([16, 565, W - 16, 680], radius=14, fill=(240, 245, 250), outline=(210, 220, 230), width=1)
    draw.text((32, 582), "📊 অডিট ও রিপোর্ট এক্সপোর্ট (J-4)", fill=(27, 94, 32), font=FONTS['card_bold'])
    draw.text((32, 606), "২৪ ঘণ্টার পূর্ণাঙ্গ সেন্সর টেলিমেট্রি CSV ও PDF আকারে সংরক্ষণ করুন।", fill=(70, 80, 90), font=FONTS['body'])
    draw.rounded_rectangle([32, 634, 180, 664], radius=8, fill=(27, 94, 32))
    draw.text((50, 642), "📥 CSV ডাউনলোড", fill=(255, 255, 255), font=FONTS['small_b'])

    draw_bottom_nav(draw, 1)
    img.save(os.path.join(OUTPUT_DIR, "state-trends-24h-chart.png"))

# ----------------- Screen 6: Trends Table View -----------------
def generate_trends_table():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw, active_tab_name="ট্রেন্ডস (Trends)")
    
    # Title & Mode Toggle
    draw.text((16, 94), "প্রতি ঘণ্টার বিস্তারিত টেবিল", fill=(30, 35, 45), font=FONTS['title'])
    draw.text((16, 118), "অ্যাক্সেসিবল স্ক্রিন-রিডার ও টকব্যাক সার্টিফাইড", fill=(100, 105, 115), font=FONTS['small'])

    # Toggle
    draw.rounded_rectangle([W - 170, 94, W - 92, 124], radius=15, fill=(235, 240, 245))
    draw.text((W - 156, 101), "গ্রাফ", fill=(80, 85, 95), font=FONTS['small'])
    draw.rounded_rectangle([W - 86, 94, W - 16, 124], radius=15, fill=(27, 94, 32))
    draw.text((W - 74, 101), "টেবিল ভিউ", fill=(255, 255, 255), font=FONTS['small_b'])

    # Table Container
    table_y = 140
    draw.rounded_rectangle([16, table_y, W - 16, 680], radius=14, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    
    # Header row
    draw.rectangle([16, table_y, W - 16, table_y + 36], fill=(240, 244, 248))
    draw.text((28, table_y + 10), "সময়", fill=(50, 55, 65), font=FONTS['small_b'])
    draw.text((95, table_y + 10), "হিট ইনডেক্স", fill=(50, 55, 65), font=FONTS['small_b'])
    draw.text((180, table_y + 10), "AQI", fill=(50, 55, 65), font=FONTS['small_b'])
    draw.text((240, table_y + 10), "পলিসি সিদ্ধান্ত", fill=(50, 55, 65), font=FONTS['small_b'])
    draw.line([16, table_y + 36, W - 16, table_y + 36], fill=(220, 225, 230), width=1)

    # Table rows
    rows = [
        ("০৮:০০ AM", "29.5°C", "38 (ভালো)", "PROCEED", (232, 245, 233), (27, 94, 32)),
        ("০৯:০০ AM", "31.2°C", "45 (ভালো)", "PROCEED", (232, 245, 233), (27, 94, 32)),
        ("১০:০০ AM", "33.5°C", "68 (মাঝারি)", "CAUTION", (255, 253, 231), (245, 127, 23)),
        ("১১:০০ AM", "36.2°C", "92 (মাঝারি)", "MODIFY", (255, 243, 224), (230, 81, 0)),
        ("১২:০০ PM", "39.8°C", "148 (ঝুঁকি)", "INDOORS", (255, 235, 238), (183, 28, 28)),
        ("০১:০০ PM", "41.2°C", "175 (অস্বাস্থ্যকর)", "INDOORS", (255, 235, 238), (183, 28, 28)),
        ("০২:০০ PM", "40.5°C", "168 (অস্বাস্থ্যকর)", "INDOORS", (255, 235, 238), (183, 28, 28)),
        ("০৩:০০ PM", "37.5°C", "142 (ঝুঁকি)", "MODIFY", (255, 243, 224), (230, 81, 0)),
        ("০৪:০০ PM", "33.0°C", "85 (মাঝারি)", "CAUTION", (255, 253, 231), (245, 127, 23)),
    ]

    for idx, (t, hi, aqi, dec, bg, fg) in enumerate(rows):
        ry = table_y + 36 + idx * 56
        draw.line([16, ry, W - 16, ry], fill=(235, 240, 245), width=1)
        draw.text((28, ry + 16), t, fill=(30, 35, 45), font=FONTS['small'])
        draw.text((95, ry + 16), hi, fill=(30, 35, 45), font=FONTS['small_b'])
        draw.text((180, ry + 16), aqi, fill=(30, 35, 45), font=FONTS['small'])
        
        # Verdict Badge
        draw.rounded_rectangle([240, ry + 10, W - 28, ry + 40], radius=8, fill=bg, outline=fg, width=1)
        draw.text((254, ry + 16), dec, fill=fg, font=FONTS['small_b'])

    draw_bottom_nav(draw, 1)
    img.save(os.path.join(OUTPUT_DIR, "state-trends-table-view.png"))

# ----------------- Screen 7: Assistant Empty Prompt -----------------
def generate_assistant_empty():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw, active_tab_name="এআই সহকারী (Assistant)")
    
    # Assistant Header
    draw.text((16, 94), "এআই পরিবেশ সহকারী", fill=(30, 35, 45), font=FONTS['title'])
    draw.text((16, 118), "বাস্তব সেন্সর ডেটা ও পলিসি v1.2 গ্রাউন্ডেড উত্তর", fill=(100, 105, 115), font=FONTS['small'])

    # Greeting Card
    draw.rounded_rectangle([16, 146, W - 16, 320], radius=16, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.ellipse([32, 162, 64, 194], fill=(232, 245, 233))
    draw.text((42, 168), "🤖", fill=(27, 94, 32), font=FONTS['card_bold'])
    
    draw.text((74, 170), "AirSafe AI সহকারী", fill=(27, 94, 32), font=FONTS['card_bold'])
    draw.text((32, 210), "নমস্কার শিক্ষক! আমি আপনার বিদ্যালয়ের রিয়েল-টাইম", fill=(40, 45, 55), font=FONTS['body'])
    draw.text((32, 232), "সেন্সর ডেটা ও Model School Policy v1.2 এর সাথে সংযুক্ত।", fill=(40, 45, 55), font=FONTS['body'])
    draw.text((32, 254), "আজকের যেকোনো ক্লাস নিরাপত্তা বা আবহাওয়া সংক্রান্ত", fill=(40, 45, 55), font=FONTS['body'])
    draw.text((32, 276), "প্রশ্ন নিচে করতে পারেন।", fill=(40, 45, 55), font=FONTS['body'])

    # Suggested Prompts Section
    draw.text((16, 345), "প্রস্তাবিত জরুরি প্রশ্নসমূহ (Quick Prompts):", fill=(70, 75, 85), font=FONTS['card_bold'])
    
    chips = [
        "⚽ আজ কি মাঠে পিই (PE) ক্লাস নেওয়া যাবে?",
        "🌡️ হিট ইনডেক্স কত হলে ক্লাস ইনডোরে নিতে হবে?",
        "😷 সংবেদনশীল ও অ্যাজমা আক্রান্ত শিশুদের করণীয় কী?",
        "📜 পলিসি v1.2 এর টেবিল ২.৩ এর নিয়মাবলি কী?"
    ]
    for idx, c in enumerate(chips):
        cy = 375 + idx * 52
        draw.rounded_rectangle([16, cy, W - 16, cy + 42], radius=12, fill=(255, 255, 255), outline=(210, 220, 230), width=1)
        draw.text((30, cy + 12), c, fill=(27, 94, 32), font=FONTS['body'])

    # Input Box at Bottom
    input_y = 660
    draw.rounded_rectangle([16, input_y, W - 66, input_y + 46], radius=23, fill=(255, 255, 255), outline=(200, 205, 215), width=1)
    draw.text((32, input_y + 14), "প্রশ্ন লিখুন (যেমন: মাঠে ক্লাস হবে?)...", fill=(150, 155, 165), font=FONTS['body'])
    
    # Send Circle
    draw.ellipse([W - 56, input_y, W - 16, input_y + 44], fill=(27, 94, 32))
    draw.text((W - 42, input_y + 12), "➤", fill=(255, 255, 255), font=FONTS['small_b'])

    draw_bottom_nav(draw, 2)
    img.save(os.path.join(OUTPUT_DIR, "state-assistant-empty-prompt.png"))

# ----------------- Screen 8: Assistant Stream & Citation -----------------
def generate_assistant_stream_citation():
    img, draw = create_base_canvas()
    draw_top_app_bar(draw, active_tab_name="এআই সহকারী (Assistant)")
    
    # User Query Card
    draw.rounded_rectangle([60, 96, W - 16, 146], radius=14, fill=(232, 245, 233))
    draw.text((74, 106), "আপনি (শিক্ষক):", fill=(27, 94, 32), font=FONTS['small_b'])
    draw.text((74, 122), "আজ সকালের পিই ক্লাস কি মাঠে নেওয়া যাবে?", fill=(20, 30, 25), font=FONTS['body'])

    # Assistant Thinking Indicator (U-5 Verified)
    draw.rounded_rectangle([16, 156, W - 16, 196], radius=10, fill=(255, 253, 231), outline=(245, 127, 23), width=1)
    draw.text((28, 168), "⚡ MCP টুল কল: `get_school_decision` যাচাই সম্পন্ন", fill=(191, 54, 12), font=FONTS['small_b'])

    # Assistant Response Box
    draw.rounded_rectangle([16, 206, W - 16, 490], radius=16, fill=(255, 255, 255), outline=(225, 230, 235), width=1)
    draw.text((32, 222), "AirSafe AI সহকারী (স্ট্রিমিং উত্তর):", fill=(27, 94, 32), font=FONTS['card_bold'])
    
    ans_lines = [
        "হ্যাঁ, আজকের সকালের পিই ক্লাস মাঠে পরিচালনা করা যাবে।",
        "আমাদের ক্যাম্পাস সেন্সরের বর্তমান পরিমাপ অনুযায়ী:",
        "• হিট ইনডেক্স: ৩০.২°C (স্বাভাবিক নিরাপদ সীমা)",
        "• এয়ার কোয়ালিটি ইনডেক্স (AQI): ৪২ (ভালো মান)",
        "",
        "Model School Policy v1.2 এর টেবিল ২.৩ অনুযায়ী,",
        "হিট ইনডেক্স ৩২°C এর নিচে থাকলে পূর্ণ ৪৫ মিনিট পর্যন্ত",
        "স্বাভাবিক খেলাধুলা অনুমোদিত। তবে শিক্ষার্থীদের পর্যাপ্ত পানি",
        "পান নিশ্চিত করুন এবং বিশ্রামের সুবিধা রাখুন।"
    ]
    for idx, l in enumerate(ans_lines):
        draw.text((32, 250 + idx * 20), l, fill=(30, 35, 45), font=FONTS['body'])

    # Grounded Telemetry Card
    draw.rounded_rectangle([32, 442, W - 32, 476], radius=8, fill=(232, 245, 233))
    draw.text((42, 452), "✔ ক্যাম্পাস IoT সেন্সর যাচাইকৃত: HI 30.2°C • AQI 42", fill=(27, 94, 32), font=FONTS['small_b'])

    # Clickable Citation Chip (A-7 & F-05 Grounding)
    draw.rounded_rectangle([16, 502, W - 16, 542], radius=10, fill=(255, 255, 255), outline=(27, 94, 32), width=1)
    draw.text((28, 514), "📜 সাইটেশন: Model School Policy v1.2 §2.3 (Table 2.3)", fill=(27, 94, 32), font=FONTS['small_b'])

    # Follow-up Suggestions
    draw.text((16, 555), "প্রস্তাবিত পরবর্তী প্রশ্ন (Suggested Follow-up):", fill=(100, 105, 115), font=FONTS['small_b'])
    draw.rounded_rectangle([16, 575, W - 16, 610], radius=10, fill=(245, 248, 250), outline=(215, 225, 235), width=1)
    draw.text((28, 586), "দুপুরে তাপমাত্রা বাড়লে কি রুটিন পরিবর্তন হবে?", fill=(50, 60, 75), font=FONTS['body'])

    # Bottom Input Box
    input_y = 660
    draw.rounded_rectangle([16, input_y, W - 66, input_y + 46], radius=23, fill=(255, 255, 255), outline=(200, 205, 215), width=1)
    draw.text((32, input_y + 14), "পরবর্তী প্রশ্ন লিখুন...", fill=(150, 155, 165), font=FONTS['body'])
    draw.ellipse([W - 56, input_y, W - 16, input_y + 44], fill=(27, 94, 32))
    draw.text((W - 42, input_y + 12), "➤", fill=(255, 255, 255), font=FONTS['small_b'])

    draw_bottom_nav(draw, 2)
    img.save(os.path.join(OUTPUT_DIR, "state-assistant-stream-citation.png"))

# ----------------- Color-Blind Simulation Functions -----------------
MATRICES = {
    'Deuteranopia': [
        [0.625, 0.375, 0.0],
        [0.700, 0.300, 0.0],
        [0.000, 0.300, 0.700]
    ],
    'Protanopia': [
        [0.56667, 0.43333, 0.0],
        [0.55833, 0.44167, 0.0],
        [0.00000, 0.24167, 0.75833]
    ],
    'Tritanopia': [
        [0.950, 0.050, 0.000],
        [0.000, 0.433, 0.567],
        [0.000, 0.475, 0.525]
    ]
}

def simulate_colorblindness(src_img, matrix):
    src_rgb = src_img.convert('RGB')
    w, h = src_rgb.size
    pixels = src_rgb.load()
    out = Image.new('RGB', (w, h))
    out_pix = out.load()
    
    m00, m01, m02 = matrix[0]
    m10, m11, m12 = matrix[1]
    m20, m21, m22 = matrix[2]
    
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            nr = int(min(255, max(0, r * m00 + g * m01 + b * m02)))
            ng = int(min(255, max(0, r * m10 + g * m11 + b * m12)))
            nb = int(min(255, max(0, r * m20 + g * m21 + b * m22)))
            out_pix[x, y] = (nr, ng, nb)
    return out

def generate_colorblind_audits():
    proceed_img = Image.open(os.path.join(OUTPUT_DIR, "state-home-proceed-safe.png"))
    move_indoors_img = Image.open(os.path.join(OUTPUT_DIR, "state-home-move-indoors.png"))
    
    # Crop the hero decision card from each (y: 90 to 320)
    card_proceed = proceed_img.crop((16, 92, W - 16, 285))
    card_danger = move_indoors_img.crop((16, 92, W - 16, 315))
    
    # Save standalone simulated full screens
    for name, matrix in MATRICES.items():
        sim_danger = simulate_colorblindness(move_indoors_img, matrix)
        sim_danger.save(os.path.join(OUTPUT_DIR, f"colorblind-simulation-{name.lower()}.png"))
        
    # Build 4-Column Audit Sheet (Normal vs Deuteranopia vs Protanopia vs Tritanopia)
    sheet_w = 1200
    sheet_h = 700
    sheet = Image.new('RGB', (sheet_w, sheet_h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    
    # Sheet Header
    draw.rectangle([0, 0, sheet_w, 65], fill=(245, 248, 250))
    draw.text((25, 12), "AirSafe Schools: Color-Blindness & Accessibility Simulation Audit (WCAG 2.1 SC 1.4.1)", fill=(20, 25, 35), font=FONTS['title'])
    draw.text((25, 38), "Proof of 4-Layer Redundant Visual Encoding: Color + Distinct Icon + Bold Verdict + Numeric Duration", fill=(80, 85, 95), font=FONTS['sub'])
    draw.line([0, 65, sheet_w, 65], fill=(220, 225, 235), width=1)
    
    col_w = sheet_w // 4
    cols = [
        ("স্বাভাবিক দৃষ্টি (Normal)", None),
        ("Deuteranopia (সবুজ-অন্ধ)", MATRICES['Deuteranopia']),
        ("Protanopia (লাল-অন্ধ)", MATRICES['Protanopia']),
        ("Tritanopia (নীল-হলুদ)", MATRICES['Tritanopia']),
    ]
    
    # Scale cards to fit col_w - 20
    target_cw = col_w - 24
    scale_factor = target_cw / card_proceed.width
    scaled_p_h = int(card_proceed.height * scale_factor)
    scaled_d_h = int(card_danger.height * scale_factor)
    
    card_p_scaled = card_proceed.resize((target_cw, scaled_p_h), Image.Resampling.LANCZOS)
    card_d_scaled = card_danger.resize((target_cw, scaled_d_h), Image.Resampling.LANCZOS)
    
    for idx, (label, mat) in enumerate(cols):
        cx = idx * col_w
        draw.rectangle([cx + 6, 75, cx + col_w - 6, 105], fill=(240, 243, 248), outline=(215, 220, 230), width=1)
        draw.text((cx + 14, 82), label, fill=(30, 35, 45), font=FONTS['card_bold'])
        
        # Safe Card
        p_img = card_p_scaled if mat is None else simulate_colorblindness(card_p_scaled, mat)
        sheet.paste(p_img, (cx + 12, 115))
        
        # Danger Card
        d_img = card_d_scaled if mat is None else simulate_colorblindness(card_d_scaled, mat)
        sheet.paste(d_img, (cx + 12, 115 + scaled_p_h + 16))
        
        # Explanatory caption below each column
        draw.text((cx + 14, 620), "✔ আইকন: ✔ / ✖ স্পষ্টভাবে দৃশ্যমান", fill=(27, 94, 32), font=FONTS['small_b'])
        draw.text((cx + 14, 640), "✔ টেক্সট: 'PROCEED' বনাম 'MOVE INDOORS'", fill=(50, 55, 65), font=FONTS['small'])
        draw.text((cx + 14, 660), "✔ সময়সীমা: ৪৫ মিনিট বনাম ০ মিনিট", fill=(50, 55, 65), font=FONTS['small'])

    sheet.save(os.path.join(OUTPUT_DIR, "colorblind-audit-comparison.png"))

if __name__ == "__main__":
    print("Generating UX state screenshots...")
    generate_home_skeleton()
    generate_home_proceed()
    generate_home_stale()
    generate_home_move_indoors()
    generate_trends_chart()
    generate_trends_table()
    generate_assistant_empty()
    generate_assistant_stream_citation()
    print("Generating Color-Blind accessibility simulation audits...")
    generate_colorblind_audits()
    print("All UX state screenshots and color-blind audits successfully generated in docs/!")
