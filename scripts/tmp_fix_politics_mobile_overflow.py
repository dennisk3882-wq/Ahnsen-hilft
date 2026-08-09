from pathlib import Path

path = Path('community_ui.py')
text = path.read_text(encoding='utf-8')

old_portal = '.council-portal{display:grid;gap:16px}.council-members-panel{padding:18px;'
new_portal = '.council-portal{display:grid;gap:16px;min-width:0;width:100%;max-width:100%;overflow-x:hidden}.council-portal>*{min-width:0;max-width:100%}.council-members-panel{min-width:0;width:100%;max-width:100%;padding:18px;'
assert old_portal in text, 'council portal anchor missing'
text = text.replace(old_portal, new_portal, 1)

old_grid = '.council-member-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:9px}.council-person{min-width:0;padding:13px;'
new_grid = '.council-member-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(215px,100%),1fr));gap:9px;min-width:0;width:100%;max-width:100%}.council-person{min-width:0;max-width:100%;padding:13px;'
assert old_grid in text, 'council member grid anchor missing'
text = text.replace(old_grid, new_grid, 1)

old_main = '.council-meeting-main{min-width:0}.council-meeting-main h2{margin:4px 0 7px;'
new_main = '.council-meeting-main{min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:normal}.council-meeting-main h2{margin:4px 0 7px;'
assert old_main in text, 'meeting main anchor missing'
text = text.replace(old_main, new_main, 1)

old_doc = '.council-doc{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;'
new_doc = '.council-doc{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;min-width:0;max-width:100%;'
assert old_doc in text, 'document card anchor missing'
text = text.replace(old_doc, new_doc, 1)

old_mobile = '@media(max-width:720px){.council-members-head{align-items:flex-start}.council-member-grid{display:flex;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:3px;scrollbar-width:none}.council-member-grid::-webkit-scrollbar{display:none}.council-person{flex:0 0 248px;scroll-snap-align:start}.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:1fr}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:1fr auto}}'
new_mobile = '@media(max-width:720px){.council-members-panel{padding:15px}.council-members-head{align-items:flex-start;flex-wrap:wrap}.council-member-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible;scroll-snap-type:none;padding-bottom:0}.council-person{width:auto;max-width:100%;overflow:hidden}.council-person-facts{grid-template-columns:1fr}.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr;min-width:0;max-width:100%}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:minmax(0,1fr)}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:minmax(0,1fr) auto}.council-filter,.council-source,.council-meetings,.council-meeting-card,.council-editorial{min-width:0;width:100%;max-width:100%}}'
assert old_mobile in text, 'mobile horizontal scroller anchor missing'
text = text.replace(old_mobile, new_mobile, 1)

old_small = '@media(max-width:430px){.council-search{grid-template-columns:1fr}.council-search button{min-height:44px}.council-source-links{display:grid}.council-result-count{display:none}}'
new_small = '@media(max-width:430px){.council-member-grid{grid-template-columns:1fr}.council-person-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.council-search{grid-template-columns:minmax(0,1fr)}.council-search button{min-height:44px}.council-source-links{display:grid}.council-result-count{display:none}.council-members-count{white-space:nowrap}.council-doc strong,.council-person h3,.council-person-facts strong{overflow-wrap:anywhere;white-space:normal}}'
assert old_small in text, 'small mobile anchor missing'
text = text.replace(old_small, new_small, 1)

path.write_text(text, encoding='utf-8')
