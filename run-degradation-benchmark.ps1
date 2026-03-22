# Quick script to run degradation benchmarks and generate visualizations
# For Windows PowerShell

Write-Host "🚀 Running AccessControl Degradation Benchmarks..." -ForegroundColor Green
Write-Host ""

# Run the benchmark tests
npm test -- --grep "Degradation"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Benchmarks completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Generating visualizations..." -ForegroundColor Green
    python3 visualization-scripts/plot_degradation.py
} else {
    Write-Host ""
    Write-Host "❌ Benchmarks failed. Check the output above for errors." -ForegroundColor Red
    exit 1
}
