// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
console.log("PRIVATE_B64=" + Buffer.from(priv).toString("base64"));
console.log("PUBLIC_B64=" + Buffer.from(pub).toString("base64"));
