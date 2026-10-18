# Stuki History

A Stuki fejlécében, a Theme gomb mellett megjelenő **History** gomb nyitja meg és zárja be a mentési előzményeket.

## Telepítés Firefoxba

1. Nyisd meg a Firefoxban az `about:debugging#/runtime/this-firefox` címet.
2. Kattints a **Load Temporary Add-on… / Ideiglenes kiegészítő betöltése…** gombra.
3. Válaszd ki a mellékelt `stuki-history.zip` fájlt, vagy a kicsomagolt mappában a `manifest.json` fájlt.
4. Nyisd meg vagy töltsd újra a https://progalap.elte.hu/stuki/ oldalt.
5. Jelentkezz be a szokásos ELTE-fiókoddal, és kattints a **History** gombra.

Ez az aláíratlan fejlesztői változat a Firefox újraindításáig marad telepítve. Újraindítás után a 2–3. lépéssel tölthető vissza. A normál Firefoxban a tartós telepítéshez a Mozilla által aláírt változat szükséges; ez a csomag még nincs aláírva. Firefox 128 vagy újabb szükséges.

Mozilla útmutató: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## Működés

- A webhely sárga eszköztárának színét használó History panel; a fejléc alatti területet foglalja el, külön X gomb nélkül. A fejléc History gombja vagy az Escape zárja be.
- A panel a fejléc és a lábléc között jelenik meg; asztali szélességnél kizárólag a sárga eszköztárat és a szürke munkaterületet tolja jobbra. Keskeny ablakban ráúszó panel.
- Keresés név, mentési dátum és UUID alapján.
- Korábbi verziók csoportosítása a szerver `prev_id` mezője alapján.
- Megnyitott mentés kiemelése; a megnyitás normál navigáció, a szerkesztő módosításvédelme érvényben marad.
- Frissítés UUID-változáskor és nyitott, látható lapon 30 másodpercenként, illetve a ↻ gombbal.
- A jelszót nem kéri el. A szerkesztő bejelentkezett munkamenetét használja. A rövid életű hozzáférési tokent nem tárolja.
- Csak a panel nyitott/csukott állapotát menti a bővítmény helyi tárolójába. A mentéslistát kizárólag memóriában tartja.
- Az előzményekhez olvasási kéréseket használ: `GET :3000/me`, majd `GET :3001/structograms` a `webprogramozas.inf.elte.hu` szerveren. Az első mentés megerősítésekor a szerkesztő saját mentési műveletét indítja el, amely a szokásos `POST /structograms` kérést küldi. Nincs telemetria vagy törlés.

## Ellenőrzési korlát

A felület és adatkezelés szimulált API-válaszokkal ellenőrzött. Bejelentkezett ELTE-fiókkal nem történt élő teszt. A listázó végpont hitelesítés nélkül 401-et ad; a valódi válaszformátumot és a visszaadott mentések körét nem tudtuk ellenőrizni. A bővítmény a közvetlen tömböt, valamint a `structograms`, `items` vagy `data` alatti tömböt támogatja. Eltérő formátumnál érthető hibát mutat, nem tünteti fel sikeres betöltésként.

Ha nem jelenik meg a gomb, töltsd újra az oldalt, és ellenőrizd, hogy a kiegészítő hozzáférhet-e a Stuki webhelyhez.

## Frissítés 1.3.0-ra

Ha a kiegészítőt kicsomagolt mappából töltötted be, az `about:debugging` oldalon nyomd meg az **Újratöltés / Reload** gombot, majd töltsd újra a Stuki lapot. Ha ZIP-ből telepítetted, távolítsd el az ideiglenes régi példányt, és töltsd be az új ZIP-et.

## Elnevezések

Új dokumentumon a **Save** gomb vagy a **Ctrl+S** névadó ablakot nyit. A **Mentés** vagy Enter előbb átnevezi az első függvényt, majd a szerkesztő saját mentését indítja el. A **Mégse** vagy Escape nem ment. Üres nevet nem fogad el. A későbbi verziómentések már nem kérnek nevet.

A `Main` a kezdeti struktogram alapértelmezett függvényneve. A Stuki mentéskor a teljes állapotot küldi, így a `data.structograms[].name` mezőben más név is megmarad. A diagram fölötti F művelet bekapcsolja a szerkeszthető függvényfejlécet; átírás és Save után a History ezt a nevet használja. Az eredeti klienssel, elfogott tesztkérésben igazoltuk a név megőrzését, éles írás nélkül.

A Speci ettől eltérően külön, felső szintű `name` mezőt is küld. A Stuki nem küld ilyen mentéscímet; a szerver külön `name` mezőre vonatkozó támogatását hitelesített írással nem ellenőriztük.
