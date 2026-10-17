-- Migration 006: Create Shipments, Shipment Milestones, and Telematics Logs
-- PT Trukindo Logistik Prima: Phase 4 Real-Time Client Tracking & Fleet Telematics

-- 1. Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waybill_number VARCHAR(50) NOT NULL UNIQUE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    origin_city VARCHAR(100) NOT NULL,
    origin_address TEXT,
    destination_city VARCHAR(100) NOT NULL,
    destination_address TEXT,
    service_type VARCHAR(50) NOT NULL DEFAULT 'FTL_TRUCKING',
    truck_type VARCHAR(50) NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    driver_phone VARCHAR(50),
    cargo_description TEXT,
    estimated_tonnage NUMERIC(10, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'MUAT_SELESAI'
        CHECK (status IN (
            'MUAT_SELESAI',
            'LINEHAUL_BERJALAN',
            'TRANSIT_FERRY',
            'TIBA_GUDANG_TUJUAN',
            'BONGKAR_SELESAI',
            'CANCELLED'
        )),
    current_latitude NUMERIC(10, 6),
    current_longitude NUMERIC(10, 6),
    current_speed_kph NUMERIC(5, 2) DEFAULT 0,
    engine_status VARCHAR(20) DEFAULT 'ON' CHECK (engine_status IN ('ON', 'OFF', 'IDLE')),
    geofence_status VARCHAR(50) DEFAULT 'INSIDE_ORIGIN'
        CHECK (geofence_status IN (
            'INSIDE_ORIGIN',
            'TRANSIT_CORRIDOR',
            'APPROACHING_DESTINATION',
            'INSIDE_DESTINATION'
        )),
    last_telematics_at TIMESTAMPTZ,
    estimated_arrival_at TIMESTAMPTZ,
    actual_arrival_at TIMESTAMPTZ,
    handover_officer VARCHAR(100),
    handover_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Shipment Milestones Table (Chronological chain of custody & transit events)
CREATE TABLE IF NOT EXISTS shipment_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    latitude NUMERIC(10, 6),
    longitude NUMERIC(10, 6),
    notes TEXT,
    handover_officer VARCHAR(100),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Telematics Logs Table (High-frequency GPS provider ingest McEasy / EasyGo)
CREATE TABLE IF NOT EXISTS telematics_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    latitude NUMERIC(10, 6) NOT NULL,
    longitude NUMERIC(10, 6) NOT NULL,
    speed_kph NUMERIC(5, 2) NOT NULL DEFAULT 0,
    engine_status VARCHAR(20) NOT NULL DEFAULT 'ON',
    geofence_event VARCHAR(50),
    raw_vendor_payload JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Fast Lookup & Range Query Indexes
CREATE INDEX IF NOT EXISTS idx_shipments_waybill ON shipments (waybill_number);
CREATE INDEX IF NOT EXISTS idx_shipments_license_plate ON shipments (license_plate);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments (status);
CREATE INDEX IF NOT EXISTS idx_shipments_origin_destination ON shipments (origin_city, destination_city);
CREATE INDEX IF NOT EXISTS idx_milestones_shipment_recorded ON shipment_milestones (shipment_id, recorded_at ASC);
CREATE INDEX IF NOT EXISTS idx_telematics_license_recorded ON telematics_logs (license_plate, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telematics_shipment_id ON telematics_logs (shipment_id);

-- 5. Seed Demonstration Shipments (Trans-Jawa corridor)
INSERT INTO shipments (
    waybill_number,
    client_name,
    origin_city,
    origin_address,
    destination_city,
    destination_address,
    service_type,
    truck_type,
    license_plate,
    driver_name,
    driver_phone,
    cargo_description,
    estimated_tonnage,
    status,
    current_latitude,
    current_longitude,
    current_speed_kph,
    engine_status,
    geofence_status,
    last_telematics_at,
    estimated_arrival_at
) VALUES (
    'TRK-20261017-001',
    'PT Sukses Logistik Makmur',
    'Cikarang Barat, Bekasi',
    'Kawasan Industri GIIC Blok C-12, Cikarang',
    'Rungkut Industri, Surabaya',
    'Kawasan Industri SIER Jl. Rungkut Industri III No. 45, Surabaya',
    'FTL_TRUCKING',
    'TRONTON_WINGBOX',
    'B 9182 UXZ',
    'Bambang Supriyanto',
    '+6281288990011',
    'Karton Makanan Kemasan & Biskuit Kaleng (Palletized)',
    18.50,
    'LINEHAUL_BERJALAN',
    -6.917500,
    110.418800,
    68.50,
    'ON',
    'TRANSIT_CORRIDOR',
    NOW(),
    NOW() + INTERVAL '6 hours'
), (
    'TRK-20261016-002',
    'PT Mayora Indah Tbk',
    'Balaraja, Tangerang',
    'Pabrik Balaraja KM 28, Tangerang',
    'Denpasar, Bali',
    'Depo Distribusi Cargo Sesetan, Denpasar Selatan',
    'FTL_TRUCKING',
    'TRONTON_WINGBOX',
    'B 9471 TLP',
    'Dedi Kurniawan',
    '+6281399887722',
    'Produk Biskuit Roma & Permen Kopiko',
    16.00,
    'TRANSIT_FERRY',
    -8.150000,
    114.430000,
    12.00,
    'IDLE',
    'TRANSIT_CORRIDOR',
    NOW() - INTERVAL '15 minutes',
    NOW() + INTERVAL '14 hours'
)
ON CONFLICT (waybill_number) DO NOTHING;

-- Seed Initial Milestones for Demonstration Shipment
DO $$
DECLARE
    v_shipment_id UUID;
BEGIN
    SELECT id INTO v_shipment_id FROM shipments WHERE waybill_number = 'TRK-20261017-001' LIMIT 1;
    IF v_shipment_id IS NOT NULL THEN
        INSERT INTO shipment_milestones (shipment_id, status, title, location_name, latitude, longitude, notes, handover_officer, recorded_at)
        VALUES
        (
            v_shipment_id,
            'MUAT_SELESAI',
            'Pemuatan Kargo Selesai & Berita Acara Disahkan',
            'Gudang Pengirim - Kawasan Industri GIIC Cikarang',
            -6.352400,
            107.168500,
            '32 palet dimuat dalam kondisi terpal dan seal utuh. Berita acara ditandatangani mandor gudang.',
            'Agus Santoso (Kepala Gudang Pengirim)',
            NOW() - INTERVAL '8 hours'
        ),
        (
            v_shipment_id,
            'LINEHAUL_BERJALAN',
            'Armada Berangkat Menuju Koridor Trans-Jawa',
            'Gerbang Tol Cikampek Utama KM 70',
            -6.442100,
            107.456200,
            'Kendaraan melaju stabil pada kecepatan 65-75 km/jam. Pemeriksaan tekanan ban dan rem normal.',
            'Bambang Supriyanto (Pengemudi)',
            NOW() - INTERVAL '6 hours'
        ),
        (
            v_shipment_id,
            'LINEHAUL_BERJALAN',
            'Melewati Checkpoint Tol Semarang - Batang',
            'Rest Area KM 379A Tol Batang-Semarang',
            -6.985000,
            109.912000,
            'Pemberhentian istirahat berkala pengemudi selama 30 menit sesuai SOP K3L Keselamatan Armada.',
            'Bambang Supriyanto (Pengemudi)',
            NOW() - INTERVAL '2 hours'
        )
        ON CONFLICT DO NOTHING;
    END IF;
END
$$;

-- 6. Grant Permissions to Least-Privilege Application Role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON shipments TO astraops_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON shipment_milestones TO astraops_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON telematics_logs TO astraops_app;
    END IF;
END
$$;
