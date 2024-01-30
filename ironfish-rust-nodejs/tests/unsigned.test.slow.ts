/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, Transaction, UnsignedTransaction, generateKey } from "..";

describe("UnsignedTransaction", () => {
  describe("ser/de", () => {
    it("can create an unsigned tx and deserialize it", () => {
      const key = generateKey();
      const asset = new Asset(key.publicAddress, "testcoin", "");
      const proposedTx = new Transaction(2);
      proposedTx.mint(asset, 5n);
      const unsignedTxBuffer = proposedTx.build(
        key.proofAuthorizingKey,
        key.viewKey,
        key.outgoingViewKey,
        0n
      );

      const unsignedTx = new UnsignedTransaction(unsignedTxBuffer);
      expect(unsignedTx.serialize()).toEqual(unsignedTxBuffer);
    });
  });
});
