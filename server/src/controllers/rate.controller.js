const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const tariffTypes = ["flat", "block"];

const numberOrZero = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : NaN;
};

const normalizeRatePayload = (body) => {
  const amount = numberOrZero(body.amount);
  const fixedChargeAmount = numberOrZero(body.fixed_charge_amount);
  const vatRate = numberOrZero(body.vat_rate);
  const reconnectionFeeAmount = numberOrZero(body.reconnection_fee_amount);
  const tariffType = body.tariff_type || "flat";

  if (!body.name || body.amount === undefined || body.amount === "") {
    throw new ApiError(400, "Rate name and amount are required.");
  }
  if (!tariffTypes.includes(tariffType)) throw new ApiError(400, "Tariff type must be flat or block.");
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "Amount must be zero or greater.");
  if (!Number.isFinite(fixedChargeAmount) || fixedChargeAmount < 0) {
    throw new ApiError(400, "Fixed charge must be zero or greater.");
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new ApiError(400, "VAT rate must be between 0 and 100.");
  }
  if (!Number.isFinite(reconnectionFeeAmount) || reconnectionFeeAmount < 0) {
    throw new ApiError(400, "Reconnection fee must be zero or greater.");
  }

  return {
    name: body.name,
    amount,
    tariff_type: tariffType,
    fixed_charge_amount: fixedChargeAmount,
    vat_enabled: Boolean(body.vat_enabled),
    vat_rate: vatRate,
    vat_exempt: Boolean(body.vat_exempt),
    reconnection_fee_amount: reconnectionFeeAmount,
    exemption_notes: body.exemption_notes || null,
    description: body.description || null,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active)
  };
};

const normalizeBlocks = (blocks = []) => {
  if (!Array.isArray(blocks)) throw new ApiError(400, "Tariff blocks must be an array.");

  return blocks
    .filter((block) => block && (block.min_units !== "" || block.max_units !== "" || block.unit_rate !== ""))
    .map((block, index) => {
      const minUnits = Number(block.min_units);
      const maxUnits = block.max_units === "" || block.max_units === null || block.max_units === undefined ? null : Number(block.max_units);
      const unitRate = Number(block.unit_rate);

      if (!Number.isFinite(minUnits) || minUnits < 0) throw new ApiError(400, "Block minimum units must be zero or greater.");
      if (maxUnits !== null && (!Number.isFinite(maxUnits) || maxUnits <= minUnits)) {
        throw new ApiError(400, "Block maximum units must be greater than minimum units.");
      }
      if (!Number.isFinite(unitRate) || unitRate < 0) throw new ApiError(400, "Block unit rate must be zero or greater.");

      return {
        min_units: minUnits,
        max_units: maxUnits,
        unit_rate: unitRate,
        sort_order: Number.isInteger(Number(block.sort_order)) ? Number(block.sort_order) : index
      };
    })
    .sort((left, right) => left.sort_order - right.sort_order || left.min_units - right.min_units);
};

const getRateById = async (client, id) => {
  const { rows } = await client.query(
    `SELECT r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', tb.id,
            'min_units', tb.min_units,
            'max_units', tb.max_units,
            'unit_rate', tb.unit_rate,
            'sort_order', tb.sort_order
          )
          ORDER BY tb.sort_order ASC, tb.min_units ASC, tb.id ASC
        ) FILTER (WHERE tb.id IS NOT NULL),
        '[]'::json
      ) AS blocks
     FROM rates r
     LEFT JOIN tariff_blocks tb ON tb.rate_id = r.id
     WHERE r.id = $1
     GROUP BY r.id`,
    [id]
  );
  return rows[0] || null;
};

const listRates = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', tb.id,
            'min_units', tb.min_units,
            'max_units', tb.max_units,
            'unit_rate', tb.unit_rate,
            'sort_order', tb.sort_order
          )
          ORDER BY tb.sort_order ASC, tb.min_units ASC, tb.id ASC
        ) FILTER (WHERE tb.id IS NOT NULL),
        '[]'::json
      ) AS blocks
     FROM rates r
     LEFT JOIN tariff_blocks tb ON tb.rate_id = r.id
     GROUP BY r.id
     ORDER BY r.name ASC`
  );
  res.json(rows);
});

const createRate = asyncHandler(async (req, res) => {
  const payload = normalizeRatePayload(req.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO rates (
        name, amount, tariff_type, fixed_charge_amount, vat_enabled, vat_rate,
        vat_exempt, reconnection_fee_amount, exemption_notes, description, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        payload.name,
        payload.amount,
        payload.tariff_type,
        payload.fixed_charge_amount,
        payload.vat_enabled,
        payload.vat_rate,
        payload.vat_exempt,
        payload.reconnection_fee_amount,
        payload.exemption_notes,
        payload.description,
        payload.is_active
      ]
    );
    const created = await getRateById(client, rows[0].id);
    await recordAuditEvent(client, {
      req,
      action: "rate.created",
      entityType: "rate",
      entityId: created.id,
      afterData: created
    });
    await client.query("COMMIT");
    res.status(201).json(created);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateRate = asyncHandler(async (req, res) => {
  const payload = normalizeRatePayload(req.body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const before = await getRateById(client, req.params.id);
    if (!before) throw new ApiError(404, "Rate not found.");

    const { rows } = await client.query(
      `UPDATE rates
       SET name = $1,
           amount = $2,
           tariff_type = $3,
           fixed_charge_amount = $4,
           vat_enabled = $5,
           vat_rate = $6,
           vat_exempt = $7,
           reconnection_fee_amount = $8,
           exemption_notes = $9,
           description = $10,
           is_active = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        payload.name,
        payload.amount,
        payload.tariff_type,
        payload.fixed_charge_amount,
        payload.vat_enabled,
        payload.vat_rate,
        payload.vat_exempt,
        payload.reconnection_fee_amount,
        payload.exemption_notes,
        payload.description,
        payload.is_active,
        req.params.id
      ]
    );

    await client.query(
      `UPDATE customers
       SET rate = $1, updated_at = NOW()
       WHERE rate_id = $2`,
      [rows[0].amount, rows[0].id]
    );

    const updated = await getRateById(client, rows[0].id);
    await recordAuditEvent(client, {
      req,
      action: "rate.updated",
      entityType: "rate",
      entityId: updated.id,
      beforeData: before,
      afterData: updated
    });

    await client.query("COMMIT");
    res.json(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const replaceTariffBlocks = asyncHandler(async (req, res) => {
  const blocks = normalizeBlocks(req.body.blocks);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const before = await getRateById(client, req.params.id);
    if (!before) throw new ApiError(404, "Rate not found.");

    await client.query("DELETE FROM tariff_blocks WHERE rate_id = $1", [req.params.id]);
    for (const block of blocks) {
      await client.query(
        `INSERT INTO tariff_blocks (rate_id, min_units, max_units, unit_rate, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, block.min_units, block.max_units, block.unit_rate, block.sort_order]
      );
    }

    const updated = await getRateById(client, req.params.id);
    await recordAuditEvent(client, {
      req,
      action: "rate.blocks_updated",
      entityType: "rate",
      entityId: updated.id,
      beforeData: before,
      afterData: updated
    });

    await client.query("COMMIT");
    res.json(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listRates,
  createRate,
  updateRate,
  replaceTariffBlocks
};
