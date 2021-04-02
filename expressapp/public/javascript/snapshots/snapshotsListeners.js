const { ipcRenderer } = require('electron');
let snapshotLineToDOMSelectorData;
let lastRunSnapshotLineToDOMSelectorData;
let errorData;
let lastRunErrorData;
let lineNumToComponentsList;
const snapshotWidth = 250;
const snapshotHeight = 125;

$(function(){
    $("body").on("click", ".hideRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).closest(".fullViewContents").hide();
        $(e.target).closest(".colHeader").find(".showRun").show();

        // Hide snapshots
        const winID = $(e.target).attr("winID");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"]`).css("visibility", "hidden");
        $(`.cluster[clusterIndex="${clusterIndex}"] .zoomButton[winID="${winID}"]`).css("visibility", "hidden");
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"]`).css("resize", "none");
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"]`).animate({
            width: "50px"
        }, 500);
    });

    $("body").on("click", ".showRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).hide();
        $(e.target).closest(".colHeader").find(".fullViewContents").show();

        // Show snapshots
        const winID = $(e.target).attr("winID");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"]`).css("resize", "both");
        $(`.cluster[clusterIndex="${clusterIndex}"] .zoomButton[winID="${winID}"]`).css("visibility", "visible");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"]`).css("visibility", "visible");
    });

    $("body").on("click", ".zoomIn", function(e){
        // Find the iframe element that should be zoomed
        const iframeElement = $(e.target).closest(".moreOuterSnapshotContainer").find("iframe");
        // Adjust transform
        const currentTransformString = iframeElement.css("transform");
        const scaleNum = getScaleNum(currentTransformString);
        if(scaleNum !== null){
            const newScaleNum = scaleNum + 0.1;
            iframeElement.css("transform", `scale(${newScaleNum})`);
        }
    });

    $("body").on("click", ".zoomOut", function(e){
        // Find the iframe element that should be zoomed
        const iframeElement = $(e.target).closest(".moreOuterSnapshotContainer").find("iframe");
        // Adjust transform
        const currentTransformString = iframeElement.css("transform");
        const scaleNum = getScaleNum(currentTransformString);
        if(scaleNum !== null){
            const newScaleNum = Math.max(scaleNum - 0.1, 0);
            iframeElement.css("transform", `scale(${newScaleNum})`);
        }
    });
});

ipcRenderer.on("newSnapshots", function(event, snapshotsData, componentsData, errData){
    console.log("newSnapshots");
    console.log("snapshotsData", snapshotsData);
    console.log("componentsData", componentsData);
    lastRunSnapshotLineToDOMSelectorData = snapshotLineToDOMSelectorData;
    lastRunErrorData = errorData;
    snapshotLineToDOMSelectorData = snapshotsData;
    errorData = errData;
    lineNumToComponentsList = componentsData;
});

ipcRenderer.on("showLineNumber", function(event, lineNumber){
    console.log("showLineNumber");
    // Only update if different line number
    if(lineNumber !== parseInt($("#lineNumber").text().trim())){
        $("#lineNumber").text(lineNumber);
        createSnapshots(lineNumber);
    }
});

ipcRenderer.on("forceShowLineNumber", function(event, lineNumber){
    console.log("forceShowLineNumber");
    $("#lineNumber").text(lineNumber);
    createSnapshots(lineNumber);
});

ipcRenderer.on("deleteAllSnapshotsForLine", function(event, lineNumberStr){
    delete snapshotLineToDOMSelectorData[lineNumberStr];
});

ipcRenderer.on("deleteAfterDomStringForLine", function(event, lineNumberStr){
    const lineObj = snapshotLineToDOMSelectorData[lineNumberStr];
    for(data of Object.values(lineObj)){
        delete data["afterDomString"];
    }
});

function getScaleNum(transformString){
    if(transformString.indexOf("scale") >= 0){
        const openParenIndex = transformString.indexOf("(");
        const closeParenIndex = transformString.indexOf(")");
        const num = transformString.substring(openParenIndex+1, closeParenIndex);
        return parseFloat(num);
    }else if(transformString.indexOf("matrix") >= 0){
        const openParenIndex = transformString.indexOf("(");
        const firstCommaIndex = transformString.indexOf(",");
        const num = transformString.substring(openParenIndex+1, firstCommaIndex);
        return parseFloat(num);
    }else{
        return null;
    }
}

function createSnapshots(lineNumber){
    // Should update the tooltip that's being shown
    // First delete all existing .tooltip elements
    $(".tooltip").remove();
    
    // If there's a snapshot for this line
    if(snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]){
        const newElement = $(`
            <div class="tooltip" role="tooltip" data-show="">
                <div id="labels">
                    <div id="beforeLabel" class="beforeAfterLabel">Before</div>
                    <div id="afterLabel" class="beforeAfterLabel">After</div>
                </div>
                <div id="snapshots">
                </div>
            </div>
        `).appendTo("#container");

        // Create a cluster for last run (start with all winIDs minimized)
        // (Maybe even have the cluster itself minimized?)
        if(lastRunSnapshotLineToDOMSelectorData && lastRunSnapshotLineToDOMSelectorData[lineNumber]){
            let cluster = Object.keys(lastRunSnapshotLineToDOMSelectorData[lineNumber]);
            const firstWinID = cluster[0];
            const selector = lastRunSnapshotLineToDOMSelectorData[lineNumber][firstWinID].selectorData.selectorString;
            createCluster(cluster, "Last run", newElement, lastRunSnapshotLineToDOMSelectorData, lineNumber, lastRunErrorData, selector);
        }

        let clusterList = [];
        const winIDsForThisLine = Object.keys(snapshotLineToDOMSelectorData[lineNumber]);
        if(lineNumToComponentsList && lineNumToComponentsList[lineNumber]){
            const connectedComponents = Object.values(lineNumToComponentsList[lineNumber]);

            // Create actual clusters

            const winIDsWithoutAfterSnapshot = [];
            const winIDsNotInConnectedComponents = [];

            for(const winID of winIDsForThisLine){
                let winIDFound = false;
                const winIDStr = winID + "";
                for(const component of connectedComponents){
                    if(component.includes(winIDStr)){
                        winIDFound = true;
                    }
                }
                if(!winIDFound){
                    winIDsNotInConnectedComponents.push(winIDStr);
                }

                if(!snapshotLineToDOMSelectorData[lineNumber][winID].afterDomString){
                    winIDsWithoutAfterSnapshot.push(winIDStr);
                }
            }

            // Start off using connectedComponents
            if(connectedComponents.length > 0){
                clusterList = clusterList.concat(connectedComponents);
            }

            // Cluster winIDsWithoutAfterSnapshot together as their own cluster
            if(winIDsWithoutAfterSnapshot.length > 0){
                clusterList.push(winIDsWithoutAfterSnapshot);
            }

            // For winIDsNotInConnectedComponents that are not in winIDsWithoutAfterSnapshot, keep each one separate
            for(const winIDStr of winIDsNotInConnectedComponents){
                if(!winIDsWithoutAfterSnapshot.includes(winIDStr)){
                    // For some reason this winID wasn't included in a cluster, but it does have an afterSnapshot
                    // Let's just keep it as a separate cluster
                    clusterList.push([winIDStr]);
                }
            }
        }else{
            // No clusters were identified on the server. Likely means that no winIDs on
                // this line had afterSnapshot.
            // So let's just cluster all of the winIDs together
            const cluster = [];
            for(const winID of winIDsForThisLine){
                const winIDStr = winID + "";
                cluster.push(winIDStr);
            }
            clusterList.push(cluster);
        }

        console.log(`clusterList for lineNumber ${lineNumber}`, clusterList);

        // Let's user clusterList now for grouping snapshots visually
        for(let index = 0; index < clusterList.length; index++){
            const cluster = clusterList[index];
            // cluster is of the form ["1", "2", "4"] (where "1" is a winID, etc)
            const firstWinID = cluster[0];
            const selector = snapshotLineToDOMSelectorData[lineNumber][firstWinID].selectorData.selectorString;
            createCluster(cluster, index, newElement, snapshotLineToDOMSelectorData, lineNumber, errorData, selector);
        }
        
        //const element = document.querySelector("#paramEditor");
        const element = document.querySelector("#container");
        const tooltip = newElement[0];

        /*// Pass the button, the tooltip, and some options, and Popper will do the
        // magic positioning for you:
        Popper.createPopper(tooltip, element, {
            placement: 'right'
        });*/
    }
}

function createCluster(cluster, indexOrName, newElement, snapshotObj, lineNumber, errorObj, selector){
    newElement.find("#snapshots").append(`<div class="clusterLabel">Label: ${indexOrName}</div>`);
    const clusterElement = $(`
        <div class="cluster" clusterIndex="${indexOrName}">
        </div>
    `);
    newElement.find("#snapshots").append(clusterElement);

    // Now for each winID in this cluster, create an html string and append to clusterElement
    for(let winIDIndex = 0; winIDIndex < cluster.length; winIDIndex++){
        const winIDStr = cluster[winIDIndex];
        const winID = parseInt(winIDStr);

        const lineObj = snapshotObj[lineNumber][winID];
        const beforeSnapshot = lineObj.beforeDomString;
        const afterSnapshot = lineObj.afterDomString;
        const parametersString = JSON.stringify(lineObj.parametersString);
        let errorString = "";
        const errorInfoForWin = errorObj[winID];
        if(errorInfoForWin){
            if(errorInfoForWin.errorLineNumber === lineNumber){
                // Check if lineObj.parametersString key/value are in errorInfoForWin.parameterValueSet
                const [key, value] = Object.entries(lineObj.parametersString)[0];
                if(errorInfoForWin.parameterValueSet[key] && errorInfoForWin.parameterValueSet[key] === value){
                    // Show this error for this snapshot
                    errorString = errorInfoForWin.errorMessage;
                }
            }
        }

        // If last run, minimize all snapshots. Otherwise, show snapshots if it's the first winID or there's an error; otherwise, hide.
        if((indexOrName !== "Last run") && (winIDIndex === 0 || errorString)){
            clusterElement.append(`
                <div class="colHeader" winID='${winID}'>
                    <span class="fullViewContents">
                        <span class="runInfo" winID='${winID}'>
                            ${parametersString}
                            <span class="errorText">${errorString}</span>
                        </span>
                        <button class="hideRun hideShowRun clickableButton" winID='${winID}'>Hide</button>
                    </span>
                    <button class="showRun hideShowRun clickableButton" winID='${winID}'>Show</button>
                </div>
                <div class="moreOuterSnapshotContainer" winID='${winID}'>
                    <button winID='${winID}' title="Zoom in" class="zoomButton zoomIn clickableButton">+</button>
                    <button winID='${winID}' title="Zoom out" class="zoomButton zoomOut clickableButton">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}'>
                        <div class="snapshotContainer" winID='${winID}'>
                            <iframe winID='${winID}' class='snapshot beforeSnapshot'></iframe>
                        </div>
                    </div>
                </div>
                <div class="downArrow" winID='${winID}'>&#8595;</div>
                <div class="moreOuterSnapshotContainer" winID='${winID}'>
                    <button winID='${winID}' title="Zoom in" class="zoomButton zoomIn clickableButton">+</button>
                    <button winID='${winID}' title="Zoom out" class="zoomButton zoomOut clickableButton">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}'>
                        <div class="snapshotContainer" winID='${winID}'>
                            <iframe winID='${winID}' class='snapshot afterSnapshot'></iframe>
                        </div>
                    </div>
                </div>
            `);
        }else{
            clusterElement.append(`
                <div class="colHeader" winID='${winID}' style="width: 50px;">
                    <span class="fullViewContents" style="display: none;">
                        <span class="runInfo" winID='${winID}'>
                            ${parametersString}
                        </span>
                        <button class="hideRun hideShowRun clickableButton" winID='${winID}'>Hide</button>
                    </span>
                    <button class="showRun hideShowRun clickableButton" winID='${winID}' style="display: block;">Show</button>
                </div>
                <div class="moreOuterSnapshotContainer" winID='${winID}'>
                    <button winID='${winID}' title="Zoom in" class="zoomButton zoomIn clickableButton" style="visibility: hidden;">+</button>
                    <button winID='${winID}' title="Zoom out" class="zoomButton zoomOut clickableButton" style="visibility: hidden;">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' style="width: 50px; resize: none;">
                        <div class="snapshotContainer" winID='${winID}' style="width: 50px;">
                            <iframe winID='${winID}' class='snapshot beforeSnapshot' style="visibility: hidden;"></iframe>
                        </div>
                    </div>
                </div>
                <div class="downArrow" winID='${winID}' style="width: 50px;">&#8595;</div>
                <div class="moreOuterSnapshotContainer" winID='${winID}'>
                    <button winID='${winID}' title="Zoom in" class="zoomButton zoomIn clickableButton" style="visibility: hidden;">+</button>
                    <button winID='${winID}' title="Zoom out" class="zoomButton zoomOut clickableButton" style="visibility: hidden;">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' style="width: 50px; resize: none;">
                        <div class="snapshotContainer" winID='${winID}' style="width: 50px;">
                            <iframe winID='${winID}' class='snapshot afterSnapshot' style="visibility: hidden;"></iframe>
                        </div>
                    </div>
                </div>
            `);
        }
        clusterElement.find(`[winID='${winID}'].beforeSnapshot`).attr("srcdoc", beforeSnapshot);
        clusterElement.find(`[winID='${winID}'].afterSnapshot`).attr("srcdoc", afterSnapshot);

        const beforeSnapshotIframe = document.querySelector(`[winID='${winID}'].beforeSnapshot`);
        const afterSnapshotIframe = document.querySelector(`[winID='${winID}'].afterSnapshot`);
        scaleIframe(beforeSnapshotIframe, lineObj, `left top`, selector);
        scaleIframe(afterSnapshotIframe, lineObj, `left top`, selector);
    }
}

function scaleIframe(iframeElement, lineObj, transformOriginString, selector){
    //beforeSnapshotIframeDocument.addEventListener('DOMFrameContentLoaded', (event) => {
    // Using setTimeout for now, to wait 500ms and hope that's enough for the DOM to be loaded so that
        // we know the dimensions we're accessing are stable (i.e., that the elements exist and they're not just size 0)
        // Prev tried using .onload or DOMFrameContentLoaded or DOMContentLoaded but these didn't work
    setTimeout(function(){
        const iframeDocument = iframeElement.contentWindow.document;
        if(selector){
            //const selector = lineObj.selectorData.selectorString;
            const selectorElement = iframeDocument.querySelector(selector);
            if(selectorElement){
                addCursorAndBorder(iframeElement, selector);
            }
            /*// Zoom to selector element if it is present in DOM
            if(selectorElement){
                scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString);
                //addCursorAndBorder(iframeElement, lineObj.selectorData.method, lineObj.selectorData.selectorString);
                addCursorAndBorder(iframeElement, currentSelector);
                return;
            }else{
                // TODO - Check if this is a keyboard command and if the prior command had a selector it was operating on

            }*/
        }
        // Otherwise, scale to page width
        scaleToPageWidth(iframeElement, iframeDocument, transformOriginString);
    }, 1000);
    //});
}

function scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString){
    const currentElementWidth = selectorElement.getBoundingClientRect().width;
    const currentElementHeight = selectorElement.getBoundingClientRect().height;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;*/
    
    /*const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/
    
    /*const transformOption1 = allowedSnapshotWidth / (3 * currentElementWidth); // want element to take up at most half of viewport width
    const transformOption2 = allowedSnapshotHeight / (3 * currentElementHeight); // want element to take up at most half of viewport height*/
    const transformOption1 = snapshotWidth / (3 * currentElementWidth); // want element to take up at most 1/3 of viewport width
    const transformOption2 = snapshotHeight / (3 * currentElementHeight); // want element to take up at most 1/3 of viewport height

    const chosenTransformScale = Math.min(transformOption1, transformOption2);

    /*const newSnapshotWidth = allowedSnapshotWidth / chosenTransformScale;
    const newSnapshotHeight = allowedSnapshotHeight / chosenTransformScale;*/
    const newSnapshotWidth = snapshotWidth / chosenTransformScale;
    const newSnapshotHeight = snapshotHeight / chosenTransformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${chosenTransformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;

    // Want to center it
    const scrollLeftAmount = selectorElement.getBoundingClientRect().x - newSnapshotWidth/3;
    const scrollTopAmount = selectorElement.getBoundingClientRect().y - newSnapshotHeight/3;

    iframeDocument.querySelector('html').scrollLeft = scrollLeftAmount;
    iframeDocument.querySelector('html').scrollTop = scrollTopAmount;
}

//function addCursorAndBorder(iframeElement, methodType, selector){
function addCursorAndBorder(iframeElement, selector){
    const iframeContentDocument = iframeElement.contentDocument;
    
    const targetSelector = selector;
    //const eventType = methodType;

    if(targetSelector){
        const iframeDocBody = iframeElement.contentWindow.document.body;
        console.log("iframeDocBody", iframeDocBody);
        //console.log("iframeDocBody", iframeDocBody);
        //const element = iframeDocBody.querySelector(targetSelector);
        const elements = iframeDocBody.querySelectorAll(targetSelector);
        console.log("addCursorAndBorder elements", elements);
        console.log("targetSelector", targetSelector);
        for(let element of elements){
            // Apply border only if this is an interactive widget,
                // e.g., <button>, <input>, <a>, <select>, <option>, <textarea>
            //if(element.tagName === "BUTTON" || element.tagName === "INPUT" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || element.tagName === "TEXTAREA"){
                // If a radio button or checkbox, let's add the border and mouse icon to its parent since checkboxes and radio buttons are small, won't be able to see border/mouse icon
                if(element.tagName === "INPUT" && (element.type === "checkbox" || element.type === "radio")){
                    borderElement = element.parentNode;
                }else{
                    borderElement = element;
                }
                borderElement.style.border = "5px solid #08ae0d";
                borderElement.style.borderRadius = "10px";

                // Append mouse icon img if element is semantically "clickable",
                    // e.g., button, link, radio button, checkbox, but NOT textfield etc
                if(element.tagName === "BUTTON" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || (element.tagName === "INPUT" && (element.type === "button" || element.type === "checkbox" || element.type === "color" || element.type === "file" || element.type === "radio" || element.type === "range" || element.type === "submit"))){
                    const imageElement = document.createElement('img');
                    borderElement.appendChild(imageElement);
                    
                    // Should change this to a local file
                    imageElement.src = "https://cdn2.iconfinder.com/data/icons/design-71/32/Design_design_cursor_pointer_arrow_mouse-512.png";
                    imageElement.width = 20;
                    imageElement.height = 20;
                    //imageElement.maxWidth = "50%";
                    //imageElement.maxHeight = "50%";
                    imageElement.style.position = "absolute";
                    imageElement.style.left = "calc(50% - 10px)";
                    imageElement.style.top = "calc(50% - 10px)";
                    //imageElement.style.left = "50%";
                    //imageElement.style.top = "50%";
                }
            //}
        }
    }
    /*iframeContentDocument.body.innerHTML = iframeContentDocument.body.innerHTML +
    `<style>
        .selectorReferenceInlineDecoration {
            background-color: lightsalmon;
        }
    </style>`;*/
}

function scaleToPageWidth(iframeElement, iframeDocument, transformOriginString){
    const pageWidth = iframeDocument.querySelector("body").scrollWidth;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;

    const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/

    /*const transformScale = allowedSnapshotWidth / pageWidth;
    const newSnapshotWidth = allowedSnapshotWidth / transformScale;
    const newSnapshotHeight = allowedSnapshotHeight / transformScale;*/
    
    const transformScale = snapshotWidth / pageWidth;
    const newSnapshotWidth = snapshotWidth / transformScale;
    const newSnapshotHeight = snapshotHeight / transformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${transformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;
}