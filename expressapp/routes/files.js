var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

// Update file name for current file
router.post('/updateName/', function(req, res, next) {
    console.log("updateName started");
    const updatedFileName = req.body.updatedFileName;
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileName: updatedFileName
            }
        },
        function(error, result){
            console.log("updateName finished");
            res.end();
        }
    );
});

/*router.post('/renderDifferentFile/:fileID', function(req, res, next) {
    const fileID = req.params.fileID;

});

router.post('/createNewFile', function(req, res, next) {

});*/

module.exports.router = router;
module.exports = {
    router
};