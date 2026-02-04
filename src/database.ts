/* eslint @typescript-eslint/no-unused-vars: 0 */

import sqlite3 from "sqlite3";
import crypto from "crypto";
import { instrument } from "succinct-async";
import { parseJson, now } from "@welshman/lib";
import {
  SignedEvent,
  getTagValue,
  getTagValues,
  getTags,
  getAddress,
} from "@welshman/util";
import { DATA_DIR } from "./env.js";
import type { Alert } from "./alert.js";

const db = new sqlite3.Database(DATA_DIR + "/db");

type Param = number | string | boolean;

type Row = Record<string, any>;

const run = (query: string, params: Param[] = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      return err ? reject(err) : resolve(this.changes > 0);
    });
  });

// prettier-ignore
const all = <T=Row>(query: string, params: Param[] = []) =>
  new Promise<T[]>((resolve, reject) => {
    db.all(query, params, (err, rows: T[]) => (err ? reject(err) : resolve(rows)))
  })

// prettier-ignore
const get = <T=Row>(query: string, params: Param[] = []) =>
  new Promise<T | undefined>((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err)
      } else if (row) {
        resolve(row as T)
      } else {
        resolve(undefined)
      }
    })
  })

const exists = (query: string, params: Param[] = []) =>
  new Promise<boolean>((resolve, reject) => {
    db.all(query, params, (err, rows) =>
      err ? reject(err) : resolve(rows.length > 0),
    );
  });

async function assertResult<T>(p: T | Promise<T>) {
  return (await p)!;
}

// Migrations

const addColumnIfNotExists = async (
  tableName: string,
  columnName: string,
  columnDef: string,
) => {
  try {
    const tableInfo = await all(`PRAGMA table_info(${tableName})`);
    const columnExists = tableInfo.some((col: any) => col.name === columnName);

    if (!columnExists) {
      await run(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`,
      );
    }
  } catch (err: any) {
    if (!err.message.includes("duplicate column name")) {
      throw err;
    }
  }
};

export const migrate = () =>
  new Promise<void>(async (resolve, reject) => {
    try {
      db.serialize(async () => {
        await run(
          `
          CREATE TABLE IF NOT EXISTS alerts (
            address TEXT PRIMARY KEY,
            id TEXT NOT NULL,
            pubkey TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            event JSON NOT NULL
          )
        `,
        );
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });

// Alerts

const parseAlert = (row: any): Alert | undefined => {
  if (row) {
    const event = JSON.parse(row.event);

    return { ...row, event };
  }
};

export async function insertAlert(event: SignedEvent) {
  return assertResult(
    parseAlert(
      await get(
        `INSERT INTO alerts (address, id, pubkey, created_at, event)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
          id=excluded.id,
          pubkey=excluded.pubkey,
          created_at=excluded.created_at,
          event=excluded.event
         RETURNING *`,
        [
          getAddress(event),
          event.id,
          event.pubkey,
          event.created_at,
          JSON.stringify(event),
        ],
      ),
    ),
  );
}

export const deleteAlertByAddress = instrument(
  "database.deleteAlertByAddress",
  async (address: string) => {
    return parseAlert(
      await get(`DELETE FROM alerts WHERE address = ?`, [address]),
    );
  },
);

export const deleteAlertById = instrument(
  "database.deleteAlertById",
  async (id: string) => {
    return parseAlert(await get(`DELETE FROM alerts WHERE id = ?`, [id]));
  },
);

export const getAlertByAddress = instrument(
  "database.getAlertByAddress",
  async (address: string) => {
    return parseAlert(
      await get(`SELECT * FROM alerts WHERE address = ?`, [address]),
    );
  },
);

export const getAlertById = instrument(
  "database.getAlertById",
  async (id: string) => {
    return parseAlert(await get(`SELECT * FROM alerts WHERE id = ?`, [id]));
  },
);

export const getAlertsForPubkey = instrument(
  "database.getAlertsForPubkey",
  async (pubkey: string) => {
    const rows = await all(`SELECT * FROM alerts WHERE pubkey = ?`, [pubkey]);

    return rows.map(parseAlert) as Alert[];
  },
);

export const getActiveAlerts = instrument(
  "database.getActiveAlerts",
  async () => {
    const rows = await all(`SELECT * FROM alerts`);

    return rows.map(parseAlert) as Alert[];
  },
);
