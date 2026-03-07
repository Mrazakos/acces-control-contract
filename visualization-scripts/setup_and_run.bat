@echo off
echo ==================================================================
echo Scientific Visualization Setup for AccessControl Contract
echo ==================================================================
echo.

cd /d "%~dp0"

echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo   X Python not found! Please install Python 3.8 or higher.
    echo   Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo   √ Python found
echo.

echo [2/5] Creating virtual environment...
if exist venv (
    echo   i Virtual environment already exists, skipping creation
) else (
    python -m venv venv
    if errorlevel 1 (
        echo   X Failed to create virtual environment
        pause
        exit /b 1
    )
    echo   √ Virtual environment created
)
echo.

echo [3/5] Activating virtual environment...
call venv\Scripts\activate.bat
echo   √ Virtual environment activated
echo.

echo [4/5] Installing dependencies...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt
if errorlevel 1 (
    echo   X Failed to install dependencies
    pause
    exit /b 1
)
echo   √ Dependencies installed
echo.

echo [5/5] Running visualization script...
echo ==================================================================
python generate_scientific_plots.py

if errorlevel 1 (
    echo.
    echo ==================================================================
    echo X Script execution failed
    echo ==================================================================
    echo.
    echo Make sure you have run throughput tests first:
    echo   npm run test:throughput
) else (
    echo.
    echo ==================================================================
    echo √ SUCCESS! Scientific visualizations generated
    echo ==================================================================
    echo.
    echo Output location:
    echo   ..\reports\scientific-figures
    echo.
    echo To deactivate the virtual environment, run: deactivate
)
echo.
pause
