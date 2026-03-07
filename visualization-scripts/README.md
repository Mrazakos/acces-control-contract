# Scientific Visualization Scripts

This folder contains Python scripts for generating publication-quality scientific visualizations from the AccessControl contract throughput test data.

## Overview

The visualization scripts create high-quality figures suitable for:

- Academic thesis/dissertation
- Research papers
- Technical presentations
- Publications

All figures are generated in multiple formats:

- **PNG** (300 DPI - for documents/presentations)
- **PDF** (vector - for LaTeX/publications)
- **SVG** (vector - for web/editing)

## Requirements

### Python Version

- Python 3.8 or higher

### Dependencies

Install required packages:

```bash
pip install -r requirements.txt
```

Or manually:

```bash
pip install matplotlib numpy pandas seaborn scipy
```

## Usage

### 1. Run Throughput Tests First

Before generating visualizations, you must run the throughput tests:

```bash
npm run test:throughput
```

This creates `reports/throughput-results.json` which contains the data for visualization.

### 2. Generate Scientific Plots

```bash
cd visualization-scripts
python generate_scientific_plots.py
```

### 3. View Results

Output files are saved in `reports/scientific-figures/`:

```
reports/scientific-figures/
├── png/                          # 300 DPI PNG files
│   ├── latency_vs_load_*.png
│   ├── throughput_vs_load_*.png
│   ├── gas_consumption_*.png
│   ├── latency_percentiles_*.png
│   ├── combined_metrics_*.png
│   └── scaling_comparison_all_operations.png
├── pdf/                          # Vector PDF files
│   └── (same filenames as PNG)
├── svg/                          # Vector SVG files
│   └── (same filenames as PNG)
├── summary_statistics.csv        # Summary table (CSV)
└── summary_statistics.txt        # Summary table (text)
```

## Generated Visualizations

### 1. Latency vs Load

**File:** `latency_vs_load_*.{png,pdf,svg}`

Shows how transaction confirmation latency increases with transaction load.

**Features:**

- Mean latency with error bars (±σ standard deviation)
- Min/Max range as shaded area
- Linear trend line with equation
- Demonstrates queuing and scaling behavior

**Use in thesis:** "Figure X shows the relationship between transaction load and average latency, demonstrating linear scaling behavior..."

---

### 2. Throughput vs Load

**File:** `throughput_vs_load_*.{png,pdf,svg}`

Displays the system's processing capacity (transactions per second) across different load levels.

**Features:**

- Mean throughput with error bars
- Horizontal line showing average throughput
- Shows stability of processing capacity

**Use in thesis:** "Figure X demonstrates the contract's consistent throughput of approximately 50 TX/s regardless of load..."

---

### 3. Gas Consumption

**File:** `gas_consumption_*.{png,pdf,svg}`

Bar chart showing average gas consumption per transaction.

**Features:**

- Bar chart with error bars
- Formatted y-axis (commas for thousands)
- Shows gas efficiency consistency

**Use in thesis:** "Figure X shows gas consumption remains constant at ~102,351 gas per transaction across all load levels..."

---

### 4. Latency Percentiles

**File:** `latency_percentiles_*.{png,pdf,svg}`

Multi-line plot showing latency distribution at different percentiles.

**Features:**

- p50 (median), p95, and p99 percentiles
- Identifies outliers and tail latencies
- Important for SLA analysis

**Use in thesis:** "Figure X presents latency percentiles, showing that 95% of transactions complete within..."

---

### 5. Combined Metrics (4-Panel)

**File:** `combined_metrics_*.{png,pdf,svg}`

Comprehensive 2x2 panel figure with all key metrics.

**Panels:**

- (a) Average Latency
- (b) Processing Throughput
- (c) Gas Consumption
- (d) Transaction Success Rate

**Use in thesis:** "Figure X provides a comprehensive overview of system performance..."

---

### 6. Scaling Comparison

**File:** `scaling_comparison_all_operations.{png,pdf,svg}`

Compares different operation types (Lock Registration, Credential Revocation, etc.) side-by-side.

**Features:**

- Comparative latency scaling
- Comparative throughput scaling
- Multi-colored lines for different operations

**Use in thesis:** "Figure X compares the scaling behavior of different smart contract operations..."

---

## Summary Statistics

The script also generates summary tables:

### summary_statistics.csv

Spreadsheet-compatible table with:

- Operation type
- Average latency ± std dev
- Average throughput ± std dev
- Average gas per transaction
- Success rate
- Maximum load tested

**Use in thesis:** Include in appendix or as a table in results section.

### summary_statistics.txt

Formatted text version for quick reference.

---

## Customization

### Modify Plot Style

Edit the style configuration in `generate_scientific_plots.py`:

```python
plt.rcParams.update({
    'font.size': 11,
    'font.family': 'serif',
    'savefig.dpi': 300,  # Change DPI
    # ... more options
})
```

### Change Color Scheme

Modify the color palette:

```python
sns.set_palette("husl")  # Try: "deep", "muted", "bright", "pastel", "dark", "colorblind"
```

Or set custom colors:

```python
colors = ['#2E86AB', '#F18F01', '#C73E1D', '#06A77D']
```

### Add Custom Plots

Add new methods to the `ThroughputVisualizer` class:

```python
def plot_custom_metric(self):
    agg = self.aggregate_by_load("Lock Registration")

    fig, ax = plt.subplots(figsize=(10, 6))
    # Your custom plotting code here

    self.save_figure(fig, 'custom_plot_name')
    plt.close()
```

Then call it in `generate_all_plots()`.

---

## Integration with LaTeX

### Include PDF figures in LaTeX:

```latex
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.8\textwidth]{reports/scientific-figures/pdf/latency_vs_load_lock_registration.pdf}
  \caption{Transaction latency increases linearly with load, demonstrating $O(n)$ scaling behavior.}
  \label{fig:latency_scaling}
\end{figure}
```

### Reference in text:

```latex
As shown in Figure~\ref{fig:latency_scaling}, the average transaction latency increases linearly from 300ms at 10 transactions to 11,154ms at 1,000 transactions.
```

---

## Troubleshooting

### ModuleNotFoundError: matplotlib

**Solution:**

```bash
pip install matplotlib numpy pandas seaborn scipy
```

### FileNotFoundError: throughput-results.json

**Solution:** Run throughput tests first:

```bash
npm run test:throughput
```

### Plots look blurry in Word/PowerPoint

**Solution:** Use PNG files at 300 DPI (default), or use PDF/SVG for better quality.

### Font issues on Linux

**Solution:** Install Microsoft fonts:

```bash
sudo apt-get install ttf-mscorefonts-installer
```

Or change font family in the script:

```python
'font.family': 'sans-serif',
'font.sans-serif': ['Arial', 'DejaVu Sans'],
```

---

## Scientific Best Practices

### 1. Error Bars

All plots include error bars (±1 standard deviation) showing measurement variability across multiple runs.

### 2. Statistical Aggregation

Data is aggregated from 3 runs per load level, with mean and standard deviation calculated.

### 3. Publication Standards

- High DPI (300) for print quality
- Vector formats (PDF/SVG) for scalability
- Clear axis labels with units
- Proper legends and titles
- Grid lines for readability

### 4. Color Accessibility

Colors are chosen to be distinguishable for colorblind readers. If submitting to journals, consider using the "colorblind" palette:

```python
sns.set_palette("colorblind")
```

---

## Example Workflow

Complete workflow from testing to thesis:

```bash
# 1. Run throughput tests
npm run test:throughput

# 2. Generate TypeScript visualizations (interactive HTML)
npm run visualize

# 3. Generate scientific visualizations (publication-quality)
cd visualization-scripts
python generate_scientific_plots.py

# 4. Review outputs
# - reports/figures/index.html (interactive dashboard)
# - reports/scientific-figures/png/*.png (for thesis)
# - reports/scientific-figures/pdf/*.pdf (for LaTeX)

# 5. Include in thesis document
# Use PDF files in LaTeX or PNG files in Word
```

---

## Citation

If using these visualizations in academic work, consider citing the methodology:

```
Performance tests were conducted using a progressive load testing methodology,
with transaction loads ranging from 10 to 1,000 transactions. Each load level
was tested with 3 independent runs to ensure statistical reliability. Metrics
including latency, throughput, and gas consumption were captured for each
transaction and aggregated using mean and standard deviation calculations.
Visualizations were generated using Python 3.x with matplotlib, pandas, and
seaborn libraries.
```

---

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the main project README
3. Examine the script source code (well-commented)

---

## License

Same license as the parent project.
