#!/bin/bash
# Quick script to run degradation benchmarks and generate visualizations

echo "🚀 Running AccessControl Degradation Benchmarks..."
echo ""

# Run the benchmark tests
npm test -- --grep "Degradation" 

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Benchmarks completed successfully!"
    echo ""
    echo "📊 Generating visualizations..."
    python3 visualization-scripts/plot_degradation.py
else
    echo ""
    echo "❌ Benchmarks failed. Check the output above for errors."
    exit 1
fi
