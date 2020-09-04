package org.pentaho.platform.web.http;

import org.bouncycastle.util.Strings;
import org.junit.Test;
import org.pentaho.platform.web.ResolvedDomain;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CORSConfigurationTest {

  @Test
  public void testSubDomains() throws Exception {
    String allowDomains = "http://pentaho.com,http://hitachivantara.com";
    List<String> domains = Arrays.asList( Strings.split(allowDomains, ',' ));

    String origin1 = "http://subdomain1.pentaho.com";
    Boolean value1 = isAllowedSubdomain( origin1, domains );
    assertTrue(value1);
    String origin2 = "http://subdomain2.pentaho.com";
    Boolean value2 = isAllowedSubdomain( origin2, domains );
    assertTrue(value2);
    String origin3 = "http://subdomain3.hitachivantara.com";
    Boolean value3 = isAllowedSubdomain( origin3, domains );
    assertTrue(value3);
    String origin4 = "http://subdomain4.hitachivantara.com";
    Boolean value4 = isAllowedSubdomain( origin4, domains );
    assertTrue(value4);
    String origin5 = "http://subdomain4.blah.com";
    Boolean value5 = isAllowedSubdomain( origin5, domains );
    assertFalse(value5);


  }
  @Test
  public void testAnotherSubDomains() {
    String allowDomains = "http://marketingcloudapps.com,http://exacttarget.com";
    List<String> domains = Arrays.asList( Strings.split(allowDomains, ',' ));
    String origin1 = "http://subdomain2.marketingcloudapps.com";
    Boolean value1 = isAllowedSubdomain( origin1, domains );
    assertTrue(value1);
    String origin2 = "http://subdomain2.marketingcloudapps.com";
    Boolean value2 = isAllowedSubdomain( origin2, domains );
    assertTrue(value2);
    String origin3 = "http://subdomain3.exacttarget.com";
    Boolean value3 = isAllowedSubdomain( origin3, domains );
    assertTrue(value3);
    String origin4 = "http://subdomain4.exacttarget.com";
    Boolean value4 = isAllowedSubdomain( origin4, domains );
    assertTrue(value4);
    String origin5 = "http://subdomain4.blah.com";
    Boolean value5 = isAllowedSubdomain( origin5, domains );
    assertFalse(value5);
  }
  private boolean isAllowedSubdomain( String domain, List<String> allowedDomains ) {
    try {
      ResolvedDomain resolvedDomain = new ResolvedDomain( domain );
      String scheme = resolvedDomain.getScheme();
      String domainWithoutScheme = resolvedDomain.getDomainWithoutScheme();
      for ( String allowedDomain : allowedDomains ) {
        ResolvedDomain resolvedAllowedDomain = new ResolvedDomain( allowedDomain );
        if ( ( domainWithoutScheme.endsWith( "." + resolvedAllowedDomain.getDomainWithoutScheme() ) ) && ( scheme
            .equalsIgnoreCase( resolvedAllowedDomain.getScheme() ) ) ) {
          return true;
        }
      }
    } catch ( Exception e ) {
      return false;
    }
    return false;
  }
}
