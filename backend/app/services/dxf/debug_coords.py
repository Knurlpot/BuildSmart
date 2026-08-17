"""
Debug script to investigate coordinate system mismatch in blueprint extraction.

The issue: extracted polygons display shifted/wrong-shaped on the UI
Expected: polygons should align with actual room boundaries on the blueprint
"""

import sys
from pathlib import Path

def debug_extraction(dxf_path: str) -> None:
    """Debug extraction for a single DXF file."""
    from app.services.dxf.extractor import extract_dxf_blueprint
    from app.services.dxf.schemas import DxfExtractionConfig
    
    print(f"\n{'='*70}")
    print(f"DEBUG: Blueprint Coordinate Analysis")
    print(f"File: {dxf_path}")
    print(f"{'='*70}\n")
    
    # Read the file
    dxf_bytes = Path(dxf_path).read_bytes()
    
    # Extract with diagnostics
    config = DxfExtractionConfig(
        enable_hatch_analysis=True,
        enable_door_validation=True,
    )
    
    result = extract_dxf_blueprint(dxf_bytes, config)
    
    # Analyze results
    for floor_idx, floor in enumerate(result.floors):
        print(f"\nFLOOR {floor_idx + 1}: {floor.floor_level}")
        print(f"  SVG Size: {floor.image_width} x {floor.image_height}")
        print(f"  Segment Count: {len(floor.segments)}")
        
        for seg_idx, seg in enumerate(floor.segments):
            print(f"\n  Segment {seg_idx + 1}: {seg.segment_name}")
            print(f"    Area: {seg.area_sqm:.2f} sqm")
            print(f"    Confidence: {seg.confidence_score}")
            
            if seg.polygon_coords:
                coords = seg.polygon_coords
                print(f"    Polygon Points: {len(coords)}")
                
                # Calculate bounds of polygon
                xs = [x for x, y in coords]
                ys = [y for x, y in coords]
                min_x, max_x = min(xs), max(xs)
                min_y, max_y = min(ys), max(ys)
                
                print(f"    X Range: {min_x:.1f} - {max_x:.1f} (span: {max_x - min_x:.1f})")
                print(f"    Y Range: {min_y:.1f} - {max_y:.1f} (span: {max_y - min_y:.1f})")
                print(f"    First 3 points: {coords[:3]}")
    
    # Diagnostics
    if result.diagnostics:
        print(f"\n{'='*70}")
        print(f"DIAGNOSTICS:")
        print(f"{'='*70}")
        for key, value in sorted(result.diagnostics.items()):
            if isinstance(value, (int, float, str)):
                print(f"  {key}: {value}")
            elif isinstance(value, dict) and len(str(value)) < 200:
                print(f"  {key}: {value}")
            elif isinstance(value, list) and len(value) < 10:
                print(f"  {key}: {value}")


if __name__ == "__main__":
    # Check if DXF file is provided
    if len(sys.argv) < 2:
        print("Usage: python debug_coords.py <dxf_file_path>")
        print("\nExample:")
        print("  cd backend")
        print("  python -m app.services.dxf.debug_coords ../path/to/blueprint.dxf")
        sys.exit(1)
    
    dxf_file = sys.argv[1]
    if not Path(dxf_file).exists():
        print(f"Error: File not found: {dxf_file}")
        sys.exit(1)
    
    try:
        debug_extraction(dxf_file)
    except Exception as e:
        print(f"\nError during extraction: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
