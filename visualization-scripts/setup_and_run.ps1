# Setup and Run Scientific Visualization Script
# This script creates a virtual environment, installs dependencies, and runs the visualization generator

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host "Scientific Visualization Setup for AccessControl Contract" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# Get the script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Step 1: Check if Python is installed
Write-Host "`n[1/5] Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Python not found! Please install Python 3.8 or higher." -ForegroundColor Red
    Write-Host "  Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Step 2: Create virtual environment
Write-Host "`n[2/5] Creating virtual environment..." -ForegroundColor Yellow
if (Test-Path "venv") {
    Write-Host "  ℹ Virtual environment already exists, skipping creation" -ForegroundColor Blue
} else {
    python -m venv venv
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Virtual environment created successfully" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Activate virtual environment
Write-Host "`n[3/5] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Virtual environment activated" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to activate virtual environment" -ForegroundColor Red
    Write-Host "  Try running: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
    exit 1
}

# Step 4: Install dependencies
Write-Host "`n[4/5] Installing dependencies..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Step 5: Run the visualization script
Write-Host "`n[5/5] Running visualization script..." -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
python generate_scientific_plots.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==================================================================" -ForegroundColor Cyan
    Write-Host "✓ SUCCESS! Scientific visualizations generated" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host "`nOutput location:" -ForegroundColor Yellow
    Write-Host "  $(Resolve-Path '..\reports\scientific-figures')" -ForegroundColor White
    Write-Host "`nTo deactivate the virtual environment, run:" -ForegroundColor Yellow
    Write-Host "  deactivate" -ForegroundColor White
} else {
    Write-Host "`n==================================================================" -ForegroundColor Red
    Write-Host "✗ Script execution failed" -ForegroundColor Red
    Write-Host "==================================================================" -ForegroundColor Red
    Write-Host "`nMake sure you have run throughput tests first:" -ForegroundColor Yellow
    Write-Host "  npm run test:throughput" -ForegroundColor White
}
