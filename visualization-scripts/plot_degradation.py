#!/usr/bin/env python3
"""
Visualization script for performance degradation benchmarks.
Generates charts showing how registration and revocation performance
degrade with increasing transaction count.
"""

import json
import os
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

def load_degradation_data(benchmark_file: str) -> dict:
    """Load degradation benchmark data from JSON file."""
    with open(benchmark_file, 'r') as f:
        return json.load(f)

def extract_data_by_operation(degradation_data: list):
    """Extract and organize data by operation type."""
    registrations = []
    revocations = []
    
    for point in degradation_data:
        if point['operation'] == 'register':
            registrations.append(point)
        elif point['operation'] == 'revoke':
            revocations.append(point)
    
    # Sort by transaction count
    registrations.sort(key=lambda x: x['transactionCount'])
    revocations.sort(key=lambda x: x['transactionCount'])
    
    return registrations, revocations

def create_timing_plot(registrations, revocations, output_path: str):
    """Create latency degradation plot."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    
    # Registration timing
    if registrations:
        reg_txs = [r['transactionCount'] for r in registrations]
        reg_times = [r['avgTimeMs'] for r in registrations]
        ax1.plot(reg_txs, reg_times, marker='o', linewidth=2, markersize=8, color='#2E86AB')
        ax1.fill_between(reg_txs, reg_times, alpha=0.3, color='#2E86AB')
        ax1.set_xlabel('Transaction Count', fontsize=12)
        ax1.set_ylabel('Latency (ms)', fontsize=12)
        ax1.set_title('Lock Registration Latency Degradation', fontsize=13, fontweight='bold')
        ax1.grid(True, alpha=0.3)
        
        # Add degradation percentage
        if len(registrations) > 1:
            degradation_pct = ((registrations[-1]['avgTimeMs'] - registrations[0]['avgTimeMs']) / 
                              registrations[0]['avgTimeMs'] * 100)
            ax1.text(0.98, 0.05, f'Degradation: {degradation_pct:.1f}%',
                    transform=ax1.transAxes, fontsize=11,
                    verticalalignment='bottom', horizontalalignment='right',
                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    
    # Revocation timing
    if revocations:
        rev_txs = [r['transactionCount'] for r in revocations]
        rev_times = [r['avgTimeMs'] for r in revocations]
        ax2.plot(rev_txs, rev_times, marker='s', linewidth=2, markersize=8, color='#A23B72')
        ax2.fill_between(rev_txs, rev_times, alpha=0.3, color='#A23B72')
        ax2.set_xlabel('Transaction Count', fontsize=12)
        ax2.set_ylabel('Latency (ms)', fontsize=12)
        ax2.set_title('Credential Revocation Latency Degradation', fontsize=13, fontweight='bold')
        ax2.grid(True, alpha=0.3)
        
        # Add degradation percentage
        if len(revocations) > 1:
            degradation_pct = ((revocations[-1]['avgTimeMs'] - revocations[0]['avgTimeMs']) / 
                              revocations[0]['avgTimeMs'] * 100)
            ax2.text(0.98, 0.05, f'Degradation: {degradation_pct:.1f}%',
                    transform=ax2.transAxes, fontsize=11,
                    verticalalignment='bottom', horizontalalignment='right',
                    bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"✓ Saved timing plot to: {output_path}")
    plt.close()

def create_gas_plot(registrations, revocations, output_path: str):
    """Create gas consumption degradation plot."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    
    # Registration gas
    if registrations:
        reg_txs = [r['transactionCount'] for r in registrations]
        reg_gas = [int(r['avgGas']) for r in registrations]
        ax1.plot(reg_txs, reg_gas, marker='o', linewidth=2, markersize=8, color='#F18F01')
        ax1.fill_between(reg_txs, reg_gas, alpha=0.3, color='#F18F01')
        ax1.set_xlabel('Transaction Count', fontsize=12)
        ax1.set_ylabel('Gas Usage', fontsize=12)
        ax1.set_title('Lock Registration Gas Consumption', fontsize=13, fontweight='bold')
        ax1.grid(True, alpha=0.3)
        ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{int(x/1000)}K'))
    
    # Revocation gas
    if revocations:
        rev_txs = [r['transactionCount'] for r in revocations]
        rev_gas = [int(r['avgGas']) for r in revocations]
        ax2.plot(rev_txs, rev_gas, marker='s', linewidth=2, markersize=8, color='#C73E1D')
        ax2.fill_between(rev_txs, rev_gas, alpha=0.3, color='#C73E1D')
        ax2.set_xlabel('Transaction Count', fontsize=12)
        ax2.set_ylabel('Gas Usage', fontsize=12)
        ax2.set_title('Credential Revocation Gas Consumption', fontsize=13, fontweight='bold')
        ax2.grid(True, alpha=0.3)
        ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{int(x/1000)}K'))
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"✓ Saved gas plot to: {output_path}")
    plt.close()

def generate_summary_table(registrations, revocations) -> str:
    """Generate a markdown table summarizing the degradation data."""
    table = "## Performance Degradation Summary\n\n"
    
    # Registration table
    if registrations:
        table += "### Lock Registration Performance\n\n"
        table += "| Transaction Count | Avg Latency (ms) | Avg Gas | Degradation |\n"
        table += "|:-:|:-:|:-:|:-:|\n"
        
        base_reg = registrations[0]['avgTimeMs']
        for i, r in enumerate(registrations):
            degradation = "0%" if i == 0 else f"{((r['avgTimeMs'] - base_reg) / base_reg * 100):.1f}%"
            table += f"| {r['transactionCount']} | {r['avgTimeMs']:.2f} | {r['avgGas']} | {degradation} |\n"
        table += "\n"
    
    # Revocation table
    if revocations:
        table += "### Credential Revocation Performance\n\n"
        table += "| Transaction Count | Avg Latency (ms) | Avg Gas | Degradation |\n"
        table += "|:-:|:-:|:-:|:-:|\n"
        
        base_rev = revocations[0]['avgTimeMs']
        for i, r in enumerate(revocations):
            degradation = "0%" if i == 0 else f"{((r['avgTimeMs'] - base_rev) / base_rev * 100):.1f}%"
            table += f"| {r['transactionCount']} | {r['avgTimeMs']:.2f} | {r['avgGas']} | {degradation} |\n"
    
    return table

def main():
    """Main entry point."""
    # Find the degradation-latest.json file
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    benchmark_file = project_root / "benchmarks" / "degradation-latest.json"
    
    if not benchmark_file.exists():
        print(f"❌ Benchmark file not found: {benchmark_file}")
        print("Run the benchmark tests first with: npm test -- --grep 'Degradation'")
        return
    
    print(f"📊 Loading degradation data from: {benchmark_file}")
    report = load_degradation_data(str(benchmark_file))
    degradation_data = report.get('degradationData', [])
    
    if not degradation_data:
        print("❌ No degradation data found in benchmark file")
        return
    
    registrations, revocations = extract_data_by_operation(degradation_data)
    
    # Create output directory
    output_dir = project_root / "reports" / "figures"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n📈 Generating visualization plots...\n")
    
    # Create plots
    timing_plot = output_dir / "degradation-latency-comparison.png"
    gas_plot = output_dir / "degradation-gas-comparison.png"
    
    create_timing_plot(registrations, revocations, str(timing_plot))
    create_gas_plot(registrations, revocations, str(gas_plot))
    
    # Generate summary markdown
    summary_file = project_root / "benchmarks" / "degradation-summary.md"
    summary = generate_summary_table(registrations, revocations)
    
    with open(summary_file, 'w') as f:
        f.write(summary)
    print(f"✓ Saved summary to: {summary_file}")
    
    print(f"\n✅ Visualization complete!")
    print(f"\nGenerated files:")
    print(f"  • {timing_plot}")
    print(f"  • {gas_plot}")
    print(f"  • {summary_file}")

if __name__ == "__main__":
    main()
