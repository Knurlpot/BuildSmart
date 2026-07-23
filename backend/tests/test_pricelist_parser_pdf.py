from backend.services import extract_material_preview, normalize_material_dataset


def test_normalizes_pdf_files_into_material_records(tmp_path, monkeypatch):
    pdf_file = tmp_path / 'pricelist.pdf'
    pdf_file.write_bytes(b'%PDF-1.4\n%test\n')

    monkeypatch.setattr(
        'backend.services._extract_pdf_rows',
        lambda path: [{'name': 'Cement', 'price': '250', 'unit': 'kg'}],
    )

    records, skipped_rows = normalize_material_dataset(pdf_file)

    assert skipped_rows == 0
    assert records[0]['material_name'] == 'CEMENT'
    assert records[0]['unit'] == 'KG'
    assert records[0]['unit_price'] == 250.0


def test_extracts_preview_rows_from_pdf(tmp_path, monkeypatch):
    pdf_file = tmp_path / 'pricelist.pdf'
    pdf_file.write_bytes(b'%PDF-1.4\n%test\n')

    monkeypatch.setattr(
        'backend.services._extract_pdf_rows',
        lambda path: [
            {'name': 'Rebar', 'price': '1500', 'unit': 'pcs', 'supplier': 'Metro Steel'},
        ],
    )

    items, suppliers, columns = extract_material_preview(pdf_file, 'pricelist.pdf')

    assert len(items) == 1
    assert items[0]['item_name'] == 'Rebar'
    assert items[0]['price'] == 1500.0
    assert items[0]['unit'] == 'PC'
    assert suppliers[0]['supplier_name'] == 'Metro Steel'
    assert any(column['raw_column'] == 'name' for column in columns)


def test_loads_semicolon_csv_with_utf8_bom(tmp_path):
    csv_file = tmp_path / 'pricelist.csv'
    csv_file.write_bytes(b'\xef\xbb\xbf' + b'name;price;unit;supplier\nCement;250;kg;Metro Steel\n')

    from backend.services import _load_material_frame

    frame = _load_material_frame(csv_file)
    assert list(frame.columns) == ['name', 'price', 'unit', 'supplier']
    assert frame.iloc[0]['name'] == 'Cement'
    assert frame.iloc[0]['price'] == 250
