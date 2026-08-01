// DEV-ONLY fixtures backing /api/clients/import/upload (see lib/dev/mockFetch.ts). Same
// "visual-review tool, not a filter/persistence simulator" limitation as
// fixtures/extractedPriceRows.ts: this always returns the SAME rows regardless of which file
// was actually uploaded, because there's no real backend parser behind it yet.
//
// Two rows are deliberately missing fields (blank contact info, no downpayment on file) to
// demonstrate the no-fabrication rule end to end: those stay `null` here and must still be
// `null`, not a guessed value, after commit.
import type { DetectedClientColumn, ExtractedClientRow } from '@/hooks/useClientImport';

export const detectedClientColumnsFixture: DetectedClientColumn[] = [
  { raw_column: 'Client / Company Name', mapped_field: 'client_name', source_files: ['clients.csv'] },
  { raw_column: 'Contact Person', mapped_field: 'contact_person', source_files: ['clients.csv'] },
  { raw_column: 'Email', mapped_field: 'contact_email', source_files: ['clients.csv'] },
  { raw_column: 'Phone', mapped_field: 'contact_number', source_files: ['clients.csv'] },
  { raw_column: 'Address', mapped_field: 'client_address', source_files: ['clients.csv'] },
  { raw_column: 'New or Returning', mapped_field: 'client_type', source_files: ['clients.csv'] },
  { raw_column: 'Standard DP %', mapped_field: 'default_downpayment_percentage', source_files: ['clients.csv'] },
  { raw_column: 'Notes', mapped_field: null, source_files: ['clients.csv'] },
];

export const extractedClientRowsFixture: ExtractedClientRow[] = [
  {
    row_key: 'cimp-1',
    client_name: 'Solmar Realty Development Corp.',
    contact_person: 'Anna Reyes',
    contact_email: 'anna.reyes@solmarrealty.example',
    contact_number: '+63 917 300 5521',
    client_address: 'Km 21 East Service Rd, Muntinlupa City',
    client_type: 'New',
    default_downpayment_percentage: 25,
    notes: null,
    needs_mapping: false,
  },
  {
    row_key: 'cimp-2',
    client_name: 'Bataan Steelworks Facilities',
    contact_person: null,
    contact_email: 'facilities@bataansteel.example',
    contact_number: null,
    client_address: null,
    client_type: 'New',
    default_downpayment_percentage: null,
    notes: null,
    needs_mapping: false,
  },
  {
    row_key: 'cimp-3',
    client_name: 'Verde Hills Homeowners Assoc.',
    contact_person: 'Ramon Cruz',
    contact_email: null,
    contact_number: '+63 918 440 7702',
    client_address: 'Verde Hills Subdivision, Antipolo City',
    client_type: null,
    default_downpayment_percentage: 30,
    notes: null,
    needs_mapping: false,
  },
];
