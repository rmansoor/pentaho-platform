import sys,glob,os,xml.etree.ElementTree as E
N='{http://maven.apache.org/POM/4.0.0}'
R=os.path.expanduser('~/.m2/repository/org/pentaho')
files=[f'{R}/{a}/11.1.0.0-SNAPSHOT/{a}-11.1.0.0-SNAPSHOT.pom' for a in ('pentaho-ce-jar-parent-pom','pentaho-ce-parent-pom','pentaho-parent-pom')]
files+= [p for p in glob.glob('**/pom.xml',recursive=True) if '/target/' not in p and 'node_modules' not in p]
OWN=('pentaho','org.pentaho','com.pentaho','org.hitachivantara','com.hitachivantara','pentaho-kettle')
def own(g): return g and (g in OWN or g.startswith(('org.pentaho.','com.hitachivantara.','org.hitachivantara.','com.pentaho.')))
def t(e,n):
    x=e.find(N+n); return x.text.strip() if x is not None and x.text else ''
plugins=set(); items=set(); props={}; repos=set()
for f in files:
    r=E.parse(f).getroot()
    for p in r.iter(N+'plugin'):
        g=t(p,'groupId') or 'org.apache.maven.plugins'
        plugins.add((g,t(p,'artifactId'),t(p,'version'),os.path.basename(os.path.dirname(f)) if not f.startswith('/') else os.path.basename(f)))
    for a in r.iter(N+'artifactItem'):
        if own(t(a,'groupId')): items.add((t(a,'groupId'),t(a,'artifactId'),t(a,'type') or 'jar',t(a,'classifier'),os.path.dirname(f) or '.'))
    for u in r.iter(N+'url'):
        if u.text and 'artifactory' in u.text or (u.text or '').startswith('https://repo'): repos.add((u.text.strip(),os.path.basename(f) if f.startswith('/') else f))
print('## Pentaho-owned build plugins'); [print(' ',*x) for x in sorted(p for p in plugins if own(p[0]))]
print('## artifactItems (unpacked/copied)'); [print(' ',*x) for x in sorted(items)]
print('## repository URLs'); [print(' ',*x) for x in sorted(repos)]
