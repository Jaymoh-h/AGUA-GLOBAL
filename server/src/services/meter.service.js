const ApiError = require("../utils/apiError");

const getActiveMeter = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT *
     FROM meters
     WHERE customer_id = $1 AND status = 'active'
     ORDER BY installed_at DESC, id DESC
     LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
};

const createGeneratedMeter = async (client, customer) => {
  const { rows } = await client.query(
    `INSERT INTO meters (customer_id, meter_number, installed_at, initial_reading, status, notes)
     VALUES (
       $1,
       $2,
       COALESCE(
         (SELECT MIN(reading_date) FROM meter_readings WHERE customer_id = $1),
         CURRENT_DATE
       ),
       COALESCE(
         (
           SELECT reading_value
           FROM meter_readings
           WHERE customer_id = $1
           ORDER BY reading_date ASC, id ASC
           LIMIT 1
         ),
         0
       ),
       'active',
       'Generated automatically for customer account'
     )
     ON CONFLICT (meter_number) DO UPDATE
     SET updated_at = NOW()
     RETURNING *`,
    [customer.id, `${customer.acc_number}-MTR-1`]
  );
  return rows[0];
};

const ensureActiveMeter = async (client, customer) => {
  const activeMeter = await getActiveMeter(client, customer.id);
  if (activeMeter) return activeMeter;
  return createGeneratedMeter(client, customer);
};

const getPreviousReadingForMeter = async (client, meterId, readingDate, excludedReadingId = null) => {
  const { rows } = await client.query(
    `SELECT *
     FROM meter_readings
     WHERE meter_id = $1
       AND reading_date < $2
       AND ($3::integer IS NULL OR id <> $3)
     ORDER BY reading_date DESC, id DESC
     LIMIT 1`,
    [meterId, readingDate, excludedReadingId]
  );
  return rows[0] || null;
};

const assertMeterBelongsToCustomer = (meter, customerId) => {
  if (!meter || Number(meter.customer_id) !== Number(customerId)) {
    throw new ApiError(400, "Selected meter does not belong to this customer.");
  }
};

const getMeterHistory = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT m.*,
            latest.reading_value AS latest_reading_value,
            latest.reading_date AS latest_reading_date
     FROM meters m
     LEFT JOIN LATERAL (
       SELECT reading_value, reading_date
       FROM meter_readings mr
       WHERE mr.meter_id = m.id
       ORDER BY mr.reading_date DESC, mr.id DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE m.customer_id = $1
     ORDER BY m.status = 'active' DESC, m.installed_at DESC, m.id DESC`,
    [customerId]
  );
  return rows;
};

module.exports = {
  assertMeterBelongsToCustomer,
  ensureActiveMeter,
  getActiveMeter,
  getMeterHistory,
  getPreviousReadingForMeter
};
