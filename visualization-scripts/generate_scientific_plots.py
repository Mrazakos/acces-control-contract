"""
Simplified Scientific Visualization Generator for AccessControl Contract

Generates two Excel-style bar charts for Lock Registration operation:
1. Average latency for each load level (10, 25, 50, 100, 200, 500, 1000 ops)
2. Throughput (tx/s) for each load level

Requirements:
    pip install matplotlib pandas

Usage:
    python generate_scientific_plots.py
"""

import json
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

# Configure matplotlib for publication quality
plt.rcParams.update({
    'font.size': 11,
    'axes.labelsize': 12,
    'axes.titlesize': 13,
    'figure.dpi': 100,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
})

class ThroughputVisualizer:
    """Generate Excel-style bar charts from throughput test data."""
    
    def __init__(self, data_dir: str = "../reports", output_dir: str = "../reports/scientific-figures"):
        self.data_dir = Path(data_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories for different formats
        (self.output_dir / "png").mkdir(exist_ok=True)
        (self.output_dir / "pdf").mkdir(exist_ok=True)
        
        self.data = None
        self.df = None
    
    def load_data(self):
        """Load throughput test results from JSON file."""
        json_path = self.data_dir / "throughput-latest.json"
        
        if not json_path.exists():
            raise FileNotFoundError(f"Could not find {json_path}")
        
        with open(json_path, 'r') as f:
            self.data = json.load(f)
        
        self.df = pd.DataFrame(self.data['rawMetrics'])
        print(f"✓ Loaded {len(self.df)} test results")
    
    def aggregate_by_load(self, operation_type: str = "Lock Registration") -> pd.DataFrame:
        """Calculate average metrics for each load level."""
        # Filter by operation type
        df_filtered = self.df[self.df['operationType'] == operation_type].copy()
        
        # Group by load level and calculate mean
        grouped = df_filtered.groupby('loadLevel').agg({
            'avgLatencyMs': 'mean',
            'processingThroughput': 'mean'
        }).reset_index()
        
        return grouped
    
    def save_figure(self, fig, name: str):
        """Save figure in PNG and PDF formats."""
        for fmt in ['png', 'pdf']:
            filepath = self.output_dir / fmt / f"{name}.{fmt}"
            fig.savefig(filepath, format=fmt, bbox_inches='tight')
            print(f"  → Saved {filepath.name}")
    
    def plot_latency_bar_chart(self):
        """Create Excel-style bar chart of average latency vs load level."""
        agg = self.aggregate_by_load("Lock Registration")
        
        fig, ax = plt.subplots(figsize=(12, 7))
        
        # Convert load levels to strings for categorical axis
        x_pos = range(len(agg))
        x_labels = [str(int(x)) for x in agg['loadLevel']]
        
        # Create bar chart with Excel-like styling
        bars = ax.bar(
            x_pos,
            agg['avgLatencyMs'],
            width=0.7,
            color='#4472C4',  # Excel blue
            edgecolor='#2E4A7C',
            linewidth=1.2
        )
        
        # Add value labels on top of bars
        for i, bar in enumerate(bars):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                   f'{height:.1f} ms',
                   ha='center', va='bottom', fontsize=10, fontweight='bold')
        
        # Set x-axis
        ax.set_xticks(x_pos)
        ax.set_xticklabels(x_labels, fontsize=11)
        ax.set_xlabel('Load Level (Number of Operations)', fontweight='bold', fontsize=13)
        ax.set_ylabel('Average Latency (ms)', fontweight='bold', fontsize=13)
        ax.set_title('Lock Registration - Average Latency Performance', 
                    fontweight='bold', fontsize=15, pad=20)
        
        # Add horizontal gridlines only (Excel style)
        ax.yaxis.grid(True, linestyle='-', alpha=0.2, color='gray')
        ax.set_axisbelow(True)
        
        # Clean up spines
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        self.save_figure(fig, 'lock_registration_latency')
        plt.close()
        print("  ✓ Lock Registration latency chart created")
    
    def plot_throughput_bar_chart(self):
        """Create Excel-style bar chart of throughput (tx/s) vs load level."""
        agg = self.aggregate_by_load("Lock Registration")
        
        fig, ax = plt.subplots(figsize=(12, 7))
        
        # Convert load levels to strings for categorical axis
        x_pos = range(len(agg))
        x_labels = [str(int(x)) for x in agg['loadLevel']]
        
        # Create bar chart with Excel-like styling
        bars = ax.bar(
            x_pos,
            agg['processingThroughput'],
            width=0.7,
            color='#ED7D31',  # Excel orange
            edgecolor='#C65911',
            linewidth=1.2
        )
        
        # Add value labels on top of bars
        for i, bar in enumerate(bars):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                   f'{height:.1f} tx/s',
                   ha='center', va='bottom', fontsize=10, fontweight='bold')
        
        # Set x-axis
        ax.set_xticks(x_pos)
        ax.set_xticklabels(x_labels, fontsize=11)
        ax.set_xlabel('Load Level (Number of Operations)', fontweight='bold', fontsize=13)
        ax.set_ylabel('Throughput (tx/s)', fontweight='bold', fontsize=13)
        ax.set_title('Lock Registration - Throughput Performance', 
                    fontweight='bold', fontsize=15, pad=20)
        
        # Add horizontal gridlines only (Excel style)
        ax.yaxis.grid(True, linestyle='-', alpha=0.2, color='gray')
        ax.set_axisbelow(True)
        
        # Clean up spines
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        
        plt.tight_layout()
        self.save_figure(fig, 'lock_registration_throughput')
        plt.close()
        print("  ✓ Lock Registration throughput chart created")
    
    def generate_all_plots(self):
        """Generate both bar charts."""
        print("\n🎨 Generating Excel-Style Bar Charts...\n")
        
        self.plot_latency_bar_chart()
        self.plot_throughput_bar_chart()
        
        print("\n" + "=" * 60)
        print("✅ Charts generated successfully!")
        print("=" * 60)
        print(f"\nOutput directory: {self.output_dir.absolute()}")
        print(f"  → PNG files: {(self.output_dir / 'png').absolute()}")
        print(f"  → PDF files: {(self.output_dir / 'pdf').absolute()}")
        print()


def main():
    """Main execution function."""
    # Get script directory and project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # Initialize visualizer
    visualizer = ThroughputVisualizer(
        data_dir=str(project_root / "reports"),
        output_dir=str(project_root / "reports" / "scientific-figures")
    )
    
    try:
        # Load data
        visualizer.load_data()
        
        # Generate all plots
        visualizer.generate_all_plots()
        
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}")
        print("\nPlease run the throughput tests first:")
        print("  npm run test:throughput")
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
