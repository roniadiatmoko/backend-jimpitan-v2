const express = require('express')
const {
    simpanPersonilRonda,
    listPresensiRonda,
    hapusPersonilRonda
} = require('./controller');

const router = express.Router();

router.post('/personil', simpanPersonilRonda);
router.get('/personil/:tanggal', listPresensiRonda);
router.delete('/personil/:id', hapusPersonilRonda);

module.exports = router;