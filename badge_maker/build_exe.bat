@echo off
REM สร้างไฟล์ BadgeMaker.exe (ดับเบิลคลิกใช้ได้เลย ไม่ต้องมี Python)
cd /d "%~dp0"
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller --noconsole --onefile --name BadgeMaker app.py
echo.
echo เสร็จแล้ว: dist\BadgeMaker.exe
pause
