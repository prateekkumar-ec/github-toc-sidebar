import throttle from 'lodash/throttle';


const tocClassName = 'toc-sidebar'
const tocContentClassName = 'toc-sidebar-content'
const stickyClassName = 'sticky-top'
const DEBUG = process.env.NODE_ENV === 'development'

function debugLog(...args: any[]) {
  if (!DEBUG) return
  console.log.apply(null, args)
}

function getHeadingHref(h: Element) {
  let a: HTMLAnchorElement|null = null
  if (h.parentElement) {
    a = h.parentElement.querySelector('a.anchor')
  } else {
    a = h.querySelector('a.anchor')
  }
  debugLog('getHeadingHref', a)
  if (!a) {
    return
  }
  return a.getAttribute('href')
}

function createToC(headings: NodeListOf<Element>) {

  const toc = document.createElement('div')
  const scrollWrapper = document.createElement('div')
  scrollWrapper.classList.add('scroll-wrapper')
  const ul = document.createElement('ul')
  toc.appendChild(scrollWrapper)
  scrollWrapper.appendChild(ul)

  // Track heading hierarchy
  interface HeadingNode {
    element: HTMLLIElement;
    level: number;
    children: HTMLUListElement | null;
    childrenWrapper: HTMLDivElement | null;
    isCollapsed: boolean;
  }
  const headingNodes: HeadingNode[] = [];

  const getHeadingLevel = (tagName: string): number => {
    return parseInt(tagName.charAt(1)); // h1 -> 1, h2 -> 2, etc.
  }

  const createCollapseIcon = (hasChildren: boolean): HTMLSpanElement => {
    const icon = document.createElement('span')
    icon.classList.add('collapse-icon')
    if (hasChildren) {
      icon.innerHTML = '▸' // chevron that will rotate
      icon.classList.add('has-children')
    }
    return icon
  }

  const toggleCollapse = (node: HeadingNode, icon: HTMLSpanElement) => {
    if (!node.childrenWrapper) return
    
    node.isCollapsed = !node.isCollapsed
    if (node.isCollapsed) {
      node.childrenWrapper.classList.add('collapsed')
      icon.classList.add('collapsed')
    } else {
      node.childrenWrapper.classList.remove('collapsed')
      icon.classList.remove('collapsed')
    }
  }

  const createLi = (text: string, href: string, headingTag: string, level: number) => {
    debugLog('createLi', text, href, headingTag)
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.setAttribute('href', href)
    
    const icon = createCollapseIcon(false)
    const label = document.createElement('div')
    label.classList.add(`toc-label-${headingTag}`)
    label.innerText = text
    
    a.appendChild(icon)
    a.appendChild(label)
    li.appendChild(a)

    const node: HeadingNode = {
      element: li,
      level: level,
      children: null,
      childrenWrapper: null,
      isCollapsed: false
    }
    headingNodes.push(node)

    // Add click handler for collapse icon
    icon.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      toggleCollapse(node, icon)
    })

    return { li, node, icon }
  }

  let lastParentAtLevel: Map<number, HeadingNode> = new Map()

  for (const h of headings) {
    const href = getHeadingHref(h)
    debugLog('heading and href', h, href)
    if (!href) {
      continue
    }
    
    const level = getHeadingLevel(h.tagName.toLowerCase())
    const { li, node, icon } = createLi((h.textContent || '').trim(), href, h.tagName.toLowerCase(), level)
    
    // Find parent (closest heading with lower level)
    let parent: HeadingNode | null = null
    for (let parentLevel = level - 1; parentLevel >= 1; parentLevel--) {
      if (lastParentAtLevel.has(parentLevel)) {
        parent = lastParentAtLevel.get(parentLevel)!
        break
      }
    }

    if (parent) {
      // This is a child of a parent heading
      if (!parent.children) {
        // Create children container for parent
        parent.childrenWrapper = document.createElement('div')
        parent.childrenWrapper.classList.add('toc-children')
        
        parent.children = document.createElement('ul')
        parent.childrenWrapper.appendChild(parent.children)
        parent.element.appendChild(parent.childrenWrapper)
        
        // Update parent's icon to show it has children
        const parentIcon = parent.element.querySelector('.collapse-icon') as HTMLSpanElement
        if (parentIcon) {
          parentIcon.classList.add('has-children')
          parentIcon.innerHTML = '▸'
        }
      }
      parent.children.appendChild(li)
    } else {
      // This is a top-level heading
      ul.appendChild(li)
    }

    // Update the last parent at this level
    lastParentAtLevel.set(level, node)
    // Clear all deeper levels
    for (let clearLevel = level + 1; clearLevel <= 6; clearLevel++) {
      lastParentAtLevel.delete(clearLevel)
    }
  }
  
  return toc
}

function activeTocLinkOnScroll(toc: HTMLDivElement, headings: NodeListOf<Element>) {
    const activeClass = 'active';

    function getLinkByHeading(heading: Element) {
      const href = getHeadingHref(heading);
      if (!href) return
      return toc.querySelector(`a[href="${href}"]`);
    }

    function getOffsetTop(heading: Element) {
      if (!heading.getClientRects().length) {
        return 0;
      }
      let rect = heading.getBoundingClientRect();
      return rect.top
    }

    function activate(heading: Element, lastActiveHeading?: Element) {
      if (lastActiveHeading) {
        getLinkByHeading(lastActiveHeading)?.parentElement!.classList.remove(activeClass);
      }
      getLinkByHeading(heading)?.parentElement!.classList.add(activeClass);
    }

    // active the first heading at the beginning
    let activeHeading: Element = headings[0];
    activate(activeHeading)

    // makes the heading active before it reaches the top of the screen
    const offsetTopBuffer = 60;

    const onScroll = () => {
      const passedHeadings: Array<Element> = [];
      for (const h of headings) {
        if (getOffsetTop(h) < offsetTopBuffer) {
          passedHeadings.push(h)
        } else {
          break;
        }
      }
      let nextActiveHeading = passedHeadings.length > 0 ? passedHeadings[passedHeadings.length - 1] : headings[0]
      if (nextActiveHeading && nextActiveHeading != activeHeading) {
        activate(nextActiveHeading, activeHeading)
        activeHeading = nextActiveHeading
      }
    }

    document.addEventListener('scroll', throttle(onScroll, 100));
}

function main() {
  // check if the url matches \/\w+/\w+$\
  const projectPathRegex = /^\/[\w-]+\/[\w-]+\/?$/gm;
  if (!projectPathRegex.exec(window.location.pathname)) {
    console.log('not a project home path')
    return
  }

  // create section that will be added to sidebar later
  const section = document.createElement('section')
  section.classList.add(tocClassName)
  debugLog('create section', section)

  // create title for section
  const title = document.createElement('h2');
  title.className = 'h4';
  title.textContent = 'Outline';
  section.appendChild(title)
  debugLog('create title', title)

  // get article and headings
  const article = document.querySelector('article') as HTMLElement
  const headings = article.querySelectorAll('h1, h2, h3, h4, h5')
  debugLog('article', article)
  debugLog('headings', headings)

  // create toc
  const toc = createToC(headings)
  toc.classList.add(tocContentClassName)
  section.appendChild(toc)
  debugLog('toc', toc)

  // add section to sidebar
  const elSidebarInner = document.querySelector('.Layout-sidebar > div')!
  elSidebarInner.appendChild(section)
  debugLog('sidebar inner', elSidebarInner)

  let isSticky = false
  const toggleSticky = (flag: boolean) => {
    if (flag) {
      toc.style.width = `${toc.offsetWidth}px`
      toc.classList.add(stickyClassName)
    } else {
      toc.classList.remove(stickyClassName)
      toc.style.width = 'auto'
    }
    isSticky = flag
  }

  // handle scroll
  const onScroll = () => {
    /* make toc sticky to top when scrolled by */
    const rect = title.getBoundingClientRect();
    // console.log('scroll', rect.top, rect.bottom)
    if (rect.bottom < 0 && !isSticky) {
      // sticky toc
      toggleSticky(true)
    } else if (rect.bottom > 0 && isSticky) {
      // unsticky toc
      toggleSticky(false)
    }
  }

  document.addEventListener('scroll', onScroll)

  // handle
  activeTocLinkOnScroll(toc, headings)
}

main()
