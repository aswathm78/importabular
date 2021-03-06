export default class Importabular {
  parent = null
  width = 1
  height = 1
  data = new LooseArray()
  options = {
    onChange: null,
    onSelectionChange: null,
    contentStyle: () => null,
    cellStyle: () => null,
    minHeight: 1,
    maxHeight: Infinity,
    minWidth: 1,
    maxWidth: Infinity,
    fillScrollPaneWithCells:true,
    separatorColor:'#ddd',
  }

  fitBounds({x, y}) {
    return x >= 0 && x < this.options.maxWidth
      && y >= 0 && y < this.options.maxHeight
  }

  constructor({data = [], node, ...options}) {
    this.parent = node
    Object.assign(this.options, options)
    this.setupDom()
    this.replaceDataWithArray(data)
    this.incrementToFit({x: this.options.minWidth - 1, y: this.options.minHeight - 1})
    this.fillScrollSpace()
  }
  fillScrollSpace(){
    if(!this.options.fillScrollPaneWithCells) return
    const rows=Math.ceil(this.iframe.contentWindow.innerHeight/40)
    const cols=Math.ceil(this.iframe.contentWindow.innerWidth/100)
    this.incrementToFit({x: cols - 1, y: rows - 1})
  }

  onDataChanged() {
    if (this.options.onChange) {
      this.options.onChange(this.data.toArr())
    }
  }

  setData(data) {
    this.data.clear()
    data.forEach((row, y) =>
      row.forEach((val, x) =>
        this.setVal(x, y, val)
      ))
    for (let x = 0; x < this.width; x++)
      for (let y = 0; y < this.height; y++)
        this.refreshDisplayedValue({x, y})

  }

  renderTDContent(td, x, y) {
    const div = document.createElement('div')
    td.setAttribute('x', x.toString())
    td.setAttribute('y', y.toString())
    const val = this.getVal(x, y)
    if (val) {
      div.innerText = val;
    } else {
      // Force no collapse of cell
      div.innerHTML = '&nbsp;'
    }
    td.appendChild(div)
    this.restyle({x, y})

  }

  iframeStyle = {
    border: 'none',
    background: 'transparent',
    width: '100%',
    height: '500px'
  }
  iframeBodyStyle = {
    padding: 0, margin: 0
  }

  setupDom() {
    // We wrap the table in an iframe mostly to let the browser
    // handle the focus for us, without the need for a hidden
    // input. It also makes sure that the style of the table is "clean"
    // but makes it harder to style the content.
    const iframe = document.createElement('iframe');
    this.iframe = iframe
    this.parent.appendChild(iframe)
    const cwd = iframe.contentWindow.document
    this.cwd = cwd
    cwd.open();
    cwd.write(`<html><body><style>
    html{
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    ::-webkit-scrollbar {
        visibility: hidden;
    }
    </style></body></html>`);
    cwd.close();
    Object.assign(iframe.style, this.iframeStyle)
    Object.assign(cwd.body.style, this.iframeBodyStyle)

    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    Object.assign(table.style, {
      borderSpacing: 0,
      background: 'white',
      border: '1px solid'+this.options.separatorColor,
      fontSize: '16px',
      fontFamily: 'sans-serif',
      borderCollapse: 'separate',
    })


    table.appendChild(tbody)
    cwd.body.appendChild(table)
    this.tbody = tbody
    this.table = table

    for (let y = 0; y < this.height; y++) {
      const tr = document.createElement('tr')
      tbody.appendChild(tr)
      for (let x = 0; x < this.width; x++) {
        this.addCell(tr, x, y)
      }
    }

    this.events.forEach(name =>
      cwd.addEventListener(name, this[name], true)
    )
  }

  events = ['mousedown', 'mouseenter', 'mouseup', 'mouseleave', 'touchstart',
    'touchend', 'touchmove', 'keydown', 'paste', 'cut', 'copy'
  ]

  destroy() {
    this.destroyEditing()

    this.events.forEach(name =>
      this.cwd.removeEventListener(name, this[name], true)
    )

    this.iframe.parentElement.removeChild(this.iframe)
  }


  addCell(tr, x, y) {
    const td = document.createElement('td')
    tr.appendChild(td)
    this.renderTDContent(td, x, y)
  }

  incrementHeight() {

    if (!this.fitBounds({x:0,y:this.height})) return false
    this.height++
    const y = this.height - 1
    const tr = document.createElement('tr')

    this.tbody.appendChild(tr)
    for (let x = 0; x < this.width; x++) {
      this.addCell(tr, x, y)
    }
    return true
  }

  incrementWidth() {

    if (!this.fitBounds({x:this.width, y:0})) return false
    this.width++
    const x = this.width - 1
    Array.prototype.forEach.call(this.tbody.children, (tr, y) => {
      this.addCell(tr, x, y)
    })
    return true
  }

  incrementToFit({x, y}) {
    while (x > this.width - 1 && this.incrementWidth());
    while (y > this.height - 1 && this.incrementHeight());
  }

  paste = e => {
    if (this.editing) return
    e.preventDefault();
    const rows = parsePasteEvent(e)
    const {rx, ry} = this.selection
    const offset = {x: rx[0], y: ry[0]}

    rows.forEach((row, y) => {
      row.forEach((val, x) => {
        this.setVal(offset.x + x, offset.y + y, val)
      })
    })

    this.changeSelectedCellsStyle(() => {
      this.selectionStart = offset
      this.selectionEnd = {
        x: offset.x + rows[0].length - 1,
        y: offset.y + rows.length - 1
      }
    })
    this.onDataChanged()
  }

  getSelectionAsArray() {
    const {rx, ry} = this.selection
    if (rx[0] === rx[1]) return null
    const width = rx[1] - rx[0]
    const height = ry[1] - ry[0]
    const result = []
    for (let y = 0; y < height; y++) {
      result.push([])
      for (let x = 0; x < width; x++) {
        result[y].push(this.getVal(rx[0] + x, ry[0] + y))
      }
    }
    return result
  }

  copy = e => {
    const asArr = this.getSelectionAsArray()
    if (asArr) {
      e.preventDefault()
      e.clipboardData.setData('text/html', arrToHTML(asArr));
      e.clipboardData.setData('text/plain', asArr.map(row => row.join('\t')).join('\n'));
    }
  }

  cut = e => {
    this.copy(e)
    this.setAllSelectedCellsTo('')
  }

  keydown = e => {

    if (e.ctrlKey) return

    if (this.selectionStart) {
      if (e.key === 'Escape' && this.editing) {
        e.preventDefault()
        this.revertEdit()
        this.stopEditing()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        this.moveCursor({y: 1})
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        this.moveCursor({x: e.shiftKey ? -1 : 1})
      }
      if (!this.editing) {

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          this.setAllSelectedCellsTo('')
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          this.moveCursor({y: 1}, e.shiftKey)
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          this.moveCursor({y: -1}, e.shiftKey)
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          this.moveCursor({x: -1}, e.shiftKey)
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          this.moveCursor({x: +1}, e.shiftKey)
        }
      }


      if (e.key.length === 1 && !this.editing) {
        this.changeSelectedCellsStyle(() => {
          const {x, y} = this.selectionStart
          // We clear the value of the cell, and the keyup event will
          // happen with the cursor inside the cell and type the character there
          this.startEditing({x, y})
          this.getCell(x, y).firstChild.value = ''
        })
      }
    }
  }

  setAllSelectedCellsTo(value) {
    this.forSelectionCoord(this.selection, ({x, y}) => this.setVal(x, y, value))
    this.forSelectionCoord(this.selection, this.refreshDisplayedValue)

    this.onDataChanged()
  }

  moveCursor({x = 0, y = 0}, shiftSelectionEnd) {
    const curr = shiftSelectionEnd ? this.selectionEnd : this.selectionStart
    const nc = {x: curr.x + x, y: curr.y + y}
    if (!this.fitBounds(nc)) return
    this.stopEditing()
    this.incrementToFit(nc)
    this.changeSelectedCellsStyle(() => {
      if (shiftSelectionEnd) {
        this.selectionEnd = nc
      } else {
        this.selectionStart = this.selectionEnd = nc
      }
    })
    this.srollIntoView(nc)
  }
  srollIntoView({x,y}){
    this.getCell(x, y).scrollIntoView({behavior:'smooth', block:'nearest'})
  }

  selecting = false;
  selectionStart = null
  selectionEnd = null
  selection = {rx: [0, 0], ry: [0, 0]}
  editing = null

  mousedown = e => {

    if (this.mobile) return
    this.changeSelectedCellsStyle(() => {
      this.tbody.style.userSelect = 'none'
      this.selectionStart = this.getCoords(e);
      this.selectionEnd = this.selectionStart
      this.selecting = true;
    })
  }
  mouseenter = e => {
    if (this.mobile) return
    if (this.selecting) {
      this.changeSelectedCellsStyle(() => {
        this.selectionEnd = this.getCoords(e);
      })
    }
  }

  lastMouseUp = null
  lastMouseUpTarget = null

  endSelection() {
    this.selecting = false;
    this.tbody.style.userSelect = ''
  }

  mouseup = e => {

    if (this.mobile) return
    if (this.selecting) {
      this.changeSelectedCellsStyle(() => {
        this.selectionEnd = this.getCoords(e);
        this.endSelection()

        if (this.lastMouseUp &&
          this.lastMouseUp > Date.now() - 300 &&
          this.lastMouseUpTarget.x === this.selectionEnd.x &&
          this.lastMouseUpTarget.y === this.selectionEnd.y
        ) {
          this.startEditing(this.selectionEnd)
        }
        this.lastMouseUp = Date.now()
        this.lastMouseUpTarget = this.selectionEnd
      })
    }
  }
  mouseleave = e => {
    if(e.target===this.tbody && this.selecting) {
      this.endSelection()
    }
  }

  touchstart = e => {
    if (this.editing) return
    this.mobile = true
    this.moved = false
  }
  touchend = e => {
    if (!this.mobile) return
    if (this.editing) return
    if (!this.moved) {

      this.changeSelectedCellsStyle(() => {
        this.selectionEnd = this.selectionStart = this.getCoords(e);
      })
      this.startEditing(this.selectionEnd)
    }
  }
  touchmove = e => {
    if (!this.mobile) return
    this.moved = true
  }

  startEditing({x, y}) {

    this.editing = {x, y}
    const td = this.getCell(x, y)
    const tdSize = td.getBoundingClientRect()
    const cellSize = td.firstChild.getBoundingClientRect()
    Object.assign(td.style, {
      width: tdSize.width,
      height: tdSize.height,
    })

    td.removeChild(td.firstChild)
    const input = document.createElement('input');
    input.type = 'text'
    input.value = this.getVal(x, y)

    Object.assign(input.style, {
      width: cellSize.width,
      height: cellSize.height,
    })
    td.appendChild(input)
    input.focus()
    input.addEventListener('blur', this.stopEditing)
    input.addEventListener('keydown', this.blurIfEnter)
  }

  destroyEditing() {
    if (this.editing) {
      const {x, y} = this.editing
      const input = this.getCell(x, y).firstChild
      input.removeEventListener('blur', this.stopEditing)
      input.removeEventListener('keydown', this.blurIfEnter)
    }
  }

  revertEdit() {
    if (!this.editing) return
    const {x, y} = this.editing
    const td = this.getCell(x, y)
    const input = td.firstChild
    input.value = this.getVal(x, y)
  }

  stopEditing = () => {
    if (!this.editing) return
    const {x, y} = this.editing
    const td = this.getCell(x, y)
    td.style.width = ''
    td.style.height = ''
    const input = td.firstChild
    input.removeEventListener('blur', this.stopEditing)
    input.removeEventListener('keydown', this.blurIfEnter)
    this.setVal(x, y, input.value)
    td.removeChild(input)
    this.editing = null
    this.renderTDContent(td, x, y)
    this.onDataChanged()
  }
  blurIfEnter = e => {
    const code = e.keyCode
    if (code === 13) {
      // enter
      this.stopEditing()
      e.preventDefault()
    }
  }

  changeSelectedCellsStyle(callback) {
    const oldS = this.selection
    callback()
    this.selection = this.getSelectionCoords()
    this.forSelectionCoord(oldS, this.restyle)
    this.forSelectionCoord(this.selection, this.restyle)
    if (this.options.onSelectionChange) {
      this.options.onSelectionChange(this.selection)
    }
  }

  getSelectionCoords() {
    if (!this.selectionStart) return {rx: [0, 0], ry: [0, 0]}
    let rx = [this.selectionStart.x, this.selectionEnd.x]
    if (rx[0] > rx[1]) rx.reverse()
    let ry = [this.selectionStart.y, this.selectionEnd.y]
    if (ry[0] > ry[1]) ry.reverse()
    return {rx: [rx[0], rx[1] + 1], ry: [ry[0], ry[1] + 1]}
  }

  forSelectionCoord({rx, ry}, cb) {
    for (let x = rx[0]; x < rx[1]; x++)
      for (let y = ry[0]; y < ry[1]; y++)
        if (this.fitBounds({x, y}))
          cb({x, y})
  }

  restyle = ({x, y}) => {

    const status = this.getStatus(x, y)
    const cell = this.getCell(x, y)

    Object.assign(cell.style, this.TDStyle(x, y, status))
    Object.assign(cell.firstChild.style, this.contentStyle(x, y, status))
  }
  TDStyle(x, y, {selected, onlySelected, editTarget, editing}) {

    return {
      padding: 0,
      background: selected && !editing && !onlySelected ? '#d7f2f9' : '',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderColor: editTarget && !editing ? 'black' : (
        [y ?  this.options.separatorColor: 'transparent', 'transparent', 'transparent',
          x ? this.options.separatorColor : 'transparent'].join(' ')
      ),
      boxSizing: 'border-box',
      ...cleanStyle(this.options.cellStyle(...arguments))
    }
  }

  contentStyle(x, y, {selected, onlySelected, editTarget, editing}) {
    return {
      border: 'none',
      padding: '10px',
      minWidth: '100px',
      minHeight: '40px',
      font: 'inherit',
      lineHeight: '20px',
      color: 'inherit',
      boxSizing: 'border-box',
      ...cleanStyle(this.options.contentStyle(...arguments))
    }
  }


  refreshDisplayedValue = ({x, y}) => {
    const div = this.getCell(x, y).firstChild
    if (div.tagName === 'DIV') {
      div.innerText = this.getVal(x, y)
    }
    this.restyle({x, y})
  }


  getCoords(e) {
    // Returns the clicked cell coords or null
    let node = e.target;
    while (!node.getAttribute('x') && node.parentElement && node.parentElement !== this.parent) {
      node = node.parentElement
    }
    return {
      x: parseInt(node.getAttribute('x')) || 0,
      y: parseInt(node.getAttribute('y')) || 0,
    }
  }


  replaceDataWithArray(data) {

    data.forEach((line, y) => {
      line.forEach((val, x) => {
        this.setVal(x, y, val)
      })
    })

    this.onDataChanged()
  }

  setVal(x, y, val) {

    if (!this.fitBounds({x, y})) return

    this.data.setVal(x, y, val)
    this.incrementToFit({x: x + 1, y: y + 1})
    this.refreshDisplayedValue({x, y})
  }

  getVal(x, y) {
    return this.data.getVal(x, y)
  }

  getStatus(x, y) {
    const {rx, ry} = this.selection
    const selected = x >= rx[0] && x < rx[1] && y >= ry[0] && y < ry[1]
    const editTarget = x === rx[0] && y === ry[0] && rx[0] !== rx[1]
    const editing = this.editing && x === this.editing.x && y === this.editing.y
    const selectedCount = (rx[1] - rx[0]) * (ry[1] - ry[0])
    return {selected, editTarget, editing, onlySelected: selected && selectedCount < 2}
  }

  getCell(x, y) {
    return this.tbody.children[y].children[x]
  }

}

class LooseArray {
  // An 2D array of strings that only stores non "" values
  data = {}

  setVal(x, y, val) {
    const hash = this.data
    const cleanedVal = LooseArray.cleanVal(val)
    if (cleanedVal) {
      if (!hash[x]) hash[x] = {}
      hash[x][y] = cleanedVal
    } else {
      // delete item
      if (hash[x] && hash[x][y]) {
        delete hash[x][y]
        if (LooseArray.isEmpty(hash[x]))
          delete hash[x]
      }
    }
  }

  clear() {
    this.data = {}
  }

  getVal(x, y) {
    const hash = this.data
    return hash && hash[x] && hash[x][y] || ''
  }

  static cleanVal(val) {
    if (val === 0) return '0'
    if (!val) return ''
    return val.toString()
  }

  static isEmpty(obj) {
    return Object.keys(obj).length === 0
  }

  toArr() {
    let width = 1, height = 1;
    for (let x in this.data) {
      for (let y in this.data[x]) {
        height = Math.max(height, parseInt(y) + 1)
        width = Math.max(width, parseInt(x) + 1)
      }
    }
    const result = [];
    for (let y = 0; y < height; y++) {
      result.push([])
      for (let x = 0; x < width; x++) {
        result[y].push(this.getVal(x, y))
      }
    }
    return result
  }

}


function arrToHTML(arr) {
  const table = document.createElement('table')
  arr.forEach(row => {
    const tr = document.createElement('tr')
    table.appendChild(tr)
    row.forEach(cell => {
      const td = document.createElement('td')
      tr.appendChild(td)
      td.innerText = cell
    })
  })
  return table.outerHTML
}

function parsePasteEvent(event) {
  try {

    const html = (event.clipboardData || window.clipboardData).getData('text/html')

    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();

    const trs = iframe.contentWindow.document.querySelectorAll('tr')
    const data = [];
    Array.prototype.forEach.call(trs, (tr, y) => {
      const tds = tr.querySelectorAll('td')
      Array.prototype.forEach.call(tds, (td, x) => {
        const text = td.innerText;
        if (!data[y]) data[y] = []
        data[y][x] = text
      })
    })

    document.body.removeChild(iframe);
    if (data.length) return ensureDimensions(data)

  } catch (e) {
  }


  const fromText = (event.clipboardData || window.clipboardData).getData('text')
    .split(/\r\n|\n|\r/).map(row => row.split('\t'))
  return ensureDimensions(fromText)
}

function ensureDimensions(rows) {
  if (!rows || !rows.length || !rows[0].length) return []
  const width = rows[0].length
  const height = rows.length
  const result = []
  for (var y = 0; y < height; y++) {
    result.push([])
    for (var x = 0; x < width; x++) {
      const val = rows[y][x] || ''
      result[y].push(val)
    }
  }
  return result
}

function cleanStyle(s) {
  if (!s) return {}
  Object.keys(s).forEach(key => !s[key] && s[key] !== 0 && delete s[key]);
  return s
}