var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

// Update code for current file
router.put('/update/', function(req, res, next) {
    const updatedCode = req.body.updatedFileContents;
    console.log("updatedCode", updatedCode);
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                fileContents: updatedCode
            }
        },
        function(error, result){
            res.end();
        }
    );
});

router.post('/getCurrentFileCode/', function(req, res, next) {
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        console.log("docs[0].fileContents", docs[0].fileContents);
        res.send(docs[0].fileContents);
    });
});

module.exports.router = router;
module.exports = {
    router
};