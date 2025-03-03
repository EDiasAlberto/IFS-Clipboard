//Makes a dummy input to paste the current user clipboard data
//and then fetches the value to be able to access clipboard data
//MUST BE RUN FROM ACTIVE TAB/WINDOW, CANNOT BE SERVICE JS
function getClipboardInput() {
  var clipboardInput = document.createElement("input");
  document.body.appendChild(clipboardInput);
  clipboardInput.focus();
  document.execCommand("paste");
  var data = clipboardInput.value;
  return data;
}

setInterval(getClipboardInput, 500);
