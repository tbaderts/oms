#!/usr/bin/env python3
"""
ReadySet Metrics Collector & Visualizer

Lightweight alternative to Prometheus + Grafana for local testing.
Collects time-series metrics and generates matplotlib charts.

Usage:
    python readyset-timeseries.py              # Run collector (Ctrl+C to stop and show charts)
    python readyset-timeseries.py --duration 60  # Collect for 60 seconds
    python readyset-timeseries.py --load data.json  # Load saved data and show charts
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field, asdict
from collections import defaultdict

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
except ImportError:
    print("Installing matplotlib...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "-q"])
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates


@dataclass
class MetricsSnapshot:
    """Single point-in-time metrics snapshot"""
    timestamp: datetime
    # Query counts
    upstream_query_count: int = 0
    readyset_query_count: int = 0
    # Latencies (microseconds)
    upstream_p50_us: float = 0
    upstream_p99_us: float = 0
    readyset_p50_us: float = 0
    readyset_p99_us: float = 0
    # Resources
    memory_bytes: int = 0
    client_connections: int = 0
    upstream_connections: int = 0
    # Calculated
    cache_hit_rate: float = 0
    
    def to_dict(self):
        d = asdict(self)
        d['timestamp'] = self.timestamp.isoformat()
        return d
    
    @classmethod
    def from_dict(cls, d):
        d['timestamp'] = datetime.fromisoformat(d['timestamp'])
        return cls(**d)


class ReadySetMetricsCollector:
    """Collects and stores ReadySet metrics over time"""
    
    def __init__(self, metrics_url: str = "http://localhost:6034/metrics"):
        self.metrics_url = metrics_url
        self.snapshots: list[MetricsSnapshot] = []
        
    def fetch_metrics(self) -> Optional[str]:
        """Fetch raw metrics from ReadySet"""
        try:
            response = requests.get(self.metrics_url, timeout=5)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"Error fetching metrics: {e}")
            return None
    
    def parse_metrics(self, raw: str) -> MetricsSnapshot:
        """Parse Prometheus metrics into a snapshot"""
        snapshot = MetricsSnapshot(timestamp=datetime.now())
        
        for line in raw.split('\n'):
            if line.startswith('#') or not line.strip():
                continue
            
            # Query execution counts
            if 'execution_time_us_count' in line:
                if 'database_type="upstream"' in line:
                    match = re.search(r'\s(\d+)\s*$', line)
                    if match:
                        snapshot.upstream_query_count = int(match.group(1))
                elif 'database_type="readyset"' in line:
                    match = re.search(r'\s(\d+)\s*$', line)
                    if match:
                        snapshot.readyset_query_count = int(match.group(1))
            
            # Query latencies
            if 'execution_time_us{' in line or 'execution_time_us ' in line:
                if 'database_type="upstream"' in line:
                    if 'quantile="0.5"' in line:
                        match = re.search(r'\s(\d+\.?\d*)\s*$', line)
                        if match:
                            snapshot.upstream_p50_us = float(match.group(1))
                    elif 'quantile="0.99"' in line:
                        match = re.search(r'\s(\d+\.?\d*)\s*$', line)
                        if match:
                            snapshot.upstream_p99_us = float(match.group(1))
                elif 'database_type="readyset"' in line:
                    if 'quantile="0.5"' in line:
                        match = re.search(r'\s(\d+\.?\d*)\s*$', line)
                        if match:
                            snapshot.readyset_p50_us = float(match.group(1))
                    elif 'quantile="0.99"' in line:
                        match = re.search(r'\s(\d+\.?\d*)\s*$', line)
                        if match:
                            snapshot.readyset_p99_us = float(match.group(1))
            
            # Memory
            if line.startswith('readyset_allocator_resident_bytes'):
                match = re.search(r'\s(\d+)\s*$', line)
                if match:
                    snapshot.memory_bytes = int(match.group(1))
            
            # Connections
            if 'noria_client_connected_clients' in line:
                match = re.search(r'\s(\d+)\s*$', line)
                if match:
                    snapshot.client_connections = int(match.group(1))
            
            if 'client_upstream_connections' in line:
                match = re.search(r'\s(\d+)\s*$', line)
                if match:
                    snapshot.upstream_connections = int(match.group(1))
        
        # Calculate cache hit rate
        total = snapshot.upstream_query_count + snapshot.readyset_query_count
        if total > 0:
            snapshot.cache_hit_rate = (snapshot.readyset_query_count / total) * 100
        
        return snapshot
    
    def collect_once(self) -> Optional[MetricsSnapshot]:
        """Collect a single metrics snapshot"""
        raw = self.fetch_metrics()
        if raw:
            snapshot = self.parse_metrics(raw)
            self.snapshots.append(snapshot)
            return snapshot
        return None
    
    def collect_loop(self, duration: Optional[int] = None, interval: int = 2):
        """Continuously collect metrics"""
        print(f"\n📊 ReadySet Metrics Collector")
        print(f"   Endpoint: {self.metrics_url}")
        print(f"   Interval: {interval}s")
        if duration:
            print(f"   Duration: {duration}s")
        print(f"\n   Press Ctrl+C to stop and show charts...\n")
        
        start = time.time()
        try:
            while True:
                snapshot = self.collect_once()
                if snapshot:
                    elapsed = time.time() - start
                    print(f"[{elapsed:6.1f}s] Queries: {snapshot.readyset_query_count:4d} cache / "
                          f"{snapshot.upstream_query_count:4d} upstream | "
                          f"Hit Rate: {snapshot.cache_hit_rate:5.1f}% | "
                          f"Memory: {snapshot.memory_bytes / 1024 / 1024:.1f} MB")
                
                if duration and (time.time() - start) >= duration:
                    print(f"\n✅ Collection complete ({duration}s)")
                    break
                    
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print(f"\n\n⏹️  Collection stopped. {len(self.snapshots)} snapshots collected.")
    
    def save(self, filepath: str):
        """Save collected data to JSON"""
        data = [s.to_dict() for s in self.snapshots]
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"💾 Saved {len(self.snapshots)} snapshots to {filepath}")
    
    def load(self, filepath: str):
        """Load data from JSON"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.snapshots = [MetricsSnapshot.from_dict(d) for d in data]
        print(f"📂 Loaded {len(self.snapshots)} snapshots from {filepath}")


class MetricsVisualizer:
    """Generate charts from collected metrics"""
    
    def __init__(self, snapshots: list[MetricsSnapshot]):
        self.snapshots = snapshots
    
    def _get_times(self):
        return [s.timestamp for s in self.snapshots]
    
    def plot_all(self):
        """Generate all charts in a single figure"""
        if len(self.snapshots) < 2:
            print("⚠️  Need at least 2 data points to generate charts.")
            print("   Run the collector for longer or generate some load.")
            return
        
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle('ReadySet Cache Metrics Dashboard', fontsize=14, fontweight='bold')
        
        times = self._get_times()
        
        # 1. Query Counts Over Time
        ax1 = axes[0, 0]
        cache_counts = [s.readyset_query_count for s in self.snapshots]
        upstream_counts = [s.upstream_query_count for s in self.snapshots]
        
        ax1.plot(times, cache_counts, 'g-', linewidth=2, label='Cache Hits', marker='o', markersize=3)
        ax1.plot(times, upstream_counts, 'r-', linewidth=2, label='Upstream (Misses)', marker='o', markersize=3)
        ax1.fill_between(times, cache_counts, alpha=0.3, color='green')
        ax1.fill_between(times, upstream_counts, alpha=0.3, color='red')
        ax1.set_xlabel('Time')
        ax1.set_ylabel('Cumulative Query Count')
        ax1.set_title('Query Distribution: Cache vs Upstream')
        ax1.legend(loc='upper left')
        ax1.grid(True, alpha=0.3)
        ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        # 2. Cache Hit Rate Over Time
        ax2 = axes[0, 1]
        hit_rates = [s.cache_hit_rate for s in self.snapshots]
        
        colors = ['green' if r >= 80 else 'orange' if r >= 50 else 'red' for r in hit_rates]
        ax2.scatter(times, hit_rates, c=colors, s=50, alpha=0.7)
        ax2.plot(times, hit_rates, 'b-', linewidth=1, alpha=0.5)
        ax2.axhline(y=80, color='green', linestyle='--', alpha=0.5, label='Good (80%)')
        ax2.axhline(y=50, color='orange', linestyle='--', alpha=0.5, label='Fair (50%)')
        ax2.set_xlabel('Time')
        ax2.set_ylabel('Cache Hit Rate (%)')
        ax2.set_title('Cache Hit Rate Over Time')
        ax2.set_ylim(0, 105)
        ax2.legend(loc='lower right')
        ax2.grid(True, alpha=0.3)
        ax2.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        # 3. Latency Comparison (P50)
        ax3 = axes[1, 0]
        upstream_p50 = [s.upstream_p50_us / 1000 for s in self.snapshots]  # Convert to ms
        readyset_p50 = [s.readyset_p50_us / 1000 for s in self.snapshots]
        
        ax3.plot(times, upstream_p50, 'r-', linewidth=2, label='Upstream P50', marker='s', markersize=3)
        ax3.plot(times, readyset_p50, 'g-', linewidth=2, label='Cache P50', marker='o', markersize=3)
        ax3.set_xlabel('Time')
        ax3.set_ylabel('Latency (ms)')
        ax3.set_title('Query Latency: P50 Comparison')
        ax3.legend(loc='upper right')
        ax3.grid(True, alpha=0.3)
        ax3.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        # 4. Memory & Connections
        ax4 = axes[1, 1]
        memory_mb = [s.memory_bytes / 1024 / 1024 for s in self.snapshots]
        
        ax4_twin = ax4.twinx()
        
        line1 = ax4.plot(times, memory_mb, 'b-', linewidth=2, label='Memory (MB)', marker='o', markersize=3)
        ax4.fill_between(times, memory_mb, alpha=0.2, color='blue')
        ax4.set_xlabel('Time')
        ax4.set_ylabel('Memory (MB)', color='blue')
        ax4.tick_params(axis='y', labelcolor='blue')
        
        connections = [s.client_connections for s in self.snapshots]
        line2 = ax4_twin.plot(times, connections, 'orange', linewidth=2, label='Connections', marker='s', markersize=3)
        ax4_twin.set_ylabel('Connections', color='orange')
        ax4_twin.tick_params(axis='y', labelcolor='orange')
        
        ax4.set_title('Resource Usage')
        lines = line1 + line2
        labels = [l.get_label() for l in lines]
        ax4.legend(lines, labels, loc='upper left')
        ax4.grid(True, alpha=0.3)
        ax4.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        
        plt.tight_layout()
        plt.subplots_adjust(top=0.93)
        
        # Save and show
        output_path = Path(__file__).parent / "readyset-metrics-chart.png"
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        print(f"\n📈 Chart saved to: {output_path}")
        
        plt.show()
    
    def print_summary(self):
        """Print summary statistics"""
        if not self.snapshots:
            return
        
        print("\n" + "=" * 60)
        print(" 📊 METRICS SUMMARY")
        print("=" * 60)
        
        latest = self.snapshots[-1]
        first = self.snapshots[0]
        
        # Query delta
        cache_delta = latest.readyset_query_count - first.readyset_query_count
        upstream_delta = latest.upstream_query_count - first.upstream_query_count
        total_delta = cache_delta + upstream_delta
        
        print(f"\n Queries during collection:")
        print(f"   Total:          {total_delta:,}")
        print(f"   Cache Hits:     {cache_delta:,}")
        print(f"   Upstream:       {upstream_delta:,}")
        
        if total_delta > 0:
            rate = (cache_delta / total_delta) * 100
            print(f"   Hit Rate:       {rate:.1f}%")
        
        # Latency stats
        avg_upstream_p50 = sum(s.upstream_p50_us for s in self.snapshots) / len(self.snapshots)
        avg_readyset_p50 = sum(s.readyset_p50_us for s in self.snapshots) / len(self.snapshots)
        
        print(f"\n Average Latency (P50):")
        print(f"   Upstream:       {avg_upstream_p50 / 1000:.2f} ms")
        print(f"   ReadySet:       {avg_readyset_p50 / 1000:.2f} ms")
        
        if avg_readyset_p50 > 0:
            speedup = avg_upstream_p50 / avg_readyset_p50
            print(f"   Speedup:        {speedup:.1f}x")
        
        # Resource stats
        avg_memory = sum(s.memory_bytes for s in self.snapshots) / len(self.snapshots)
        max_memory = max(s.memory_bytes for s in self.snapshots)
        
        print(f"\n Memory Usage:")
        print(f"   Average:        {avg_memory / 1024 / 1024:.1f} MB")
        print(f"   Peak:           {max_memory / 1024 / 1024:.1f} MB")
        
        print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='ReadySet Metrics Collector & Visualizer',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python readyset-timeseries.py                    # Collect until Ctrl+C
  python readyset-timeseries.py --duration 60      # Collect for 60 seconds
  python readyset-timeseries.py --interval 5       # Sample every 5 seconds
  python readyset-timeseries.py --save data.json   # Save data for later
  python readyset-timeseries.py --load data.json   # Load and visualize saved data
        """
    )
    
    parser.add_argument('--url', default='http://localhost:6034/metrics',
                        help='ReadySet metrics endpoint URL')
    parser.add_argument('--duration', type=int, default=None,
                        help='Collection duration in seconds (default: until Ctrl+C)')
    parser.add_argument('--interval', type=int, default=2,
                        help='Sampling interval in seconds (default: 2)')
    parser.add_argument('--save', type=str, default=None,
                        help='Save collected data to JSON file')
    parser.add_argument('--load', type=str, default=None,
                        help='Load data from JSON file instead of collecting')
    parser.add_argument('--no-chart', action='store_true',
                        help='Skip chart generation')
    
    args = parser.parse_args()
    
    collector = ReadySetMetricsCollector(metrics_url=args.url)
    
    if args.load:
        # Load existing data
        collector.load(args.load)
    else:
        # Collect new data
        collector.collect_loop(duration=args.duration, interval=args.interval)
        
        if args.save:
            collector.save(args.save)
    
    if collector.snapshots and not args.no_chart:
        visualizer = MetricsVisualizer(collector.snapshots)
        visualizer.print_summary()
        visualizer.plot_all()


if __name__ == '__main__':
    main()
