var express = require('express');
var router = express.Router();

router.post('/getBorderWinIDs', function(req, res, next) {
    // return list of border window IDs
    const borderWinIDList = [];
    const objList = Object.values(req.app.locals.windowMetadata);
    for(obj of objList){
        borderWinIDList.push(obj.correspondingBorderWinID);
    }
    res.send(borderWinIDList);
});

module.exports.router = router;
module.exports = {
    router
};