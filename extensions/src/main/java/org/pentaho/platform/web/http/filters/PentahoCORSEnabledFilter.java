/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU Lesser General Public License, version 2.1 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU Lesser General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Lesser General Public License for more details.
 *
 *
 * Copyright (c) 2002-2020 Hitachi Vantara. All rights reserved.
 *
 */
package org.pentaho.platform.web.http.filters;

import org.apache.commons.lang.StringUtils;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.pentaho.platform.web.http.CORSConfiguration;
import org.pentaho.platform.web.http.messages.Messages;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.util.Assert;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;

public class PentahoCORSEnabledFilter implements Filter, InitializingBean {

  private String allowSubDomainsProperty;
  private String allowedDomainsProperty;
  private String allowAnyDomainProperty;
  private String allowedMethodsProperty;
  private String exposedHeadersProperty;
  private String allowedHeadersProperty;
  private String allowAnyHeaderProperty;
  private String supportsCredentialsProperty;
  private String maxAgeProperty;
  private static Log logger = LogFactory.getLog( PentahoCORSEnabledFilter.class );

  public void init( final FilterConfig config ) {

  }

  private void initialize() {
    logDebug( "Initializing the CORS Configuration" );
    CORSConfiguration.getInstance().setAllowAnyDomain( Boolean.parseBoolean( allowAnyDomainProperty ) );
    if ( CORSConfiguration.getInstance().isAllowAnyDomain() ) {
      logDebug( "Setting Allow Any Domain to true" );
    } else {
      logDebug( "Setting Allow Any Domain to false" );
      CORSConfiguration.getInstance().setAllowedDomains( Arrays.asList( parseDomains( allowedDomainsProperty ) ) );
      logDebug( "Setting Allow Domains to [ " + allowedDomainsProperty + " ]" );
    }
    CORSConfiguration.getInstance().setAllowSubdomains( Boolean.parseBoolean( allowSubDomainsProperty ) );
    logDebug( "Setting Allow Domains to [ " + allowedDomainsProperty + " ]" );
    CORSConfiguration.getInstance().setAllowedMethods( Arrays.asList( allowedMethodsProperty.split( "," ) ) );
    logDebug( "Setting Allow Methods to [ " + allowedMethodsProperty + " ]" );
    if ( !StringUtils.isEmpty( exposedHeadersProperty ) ) {
      CORSConfiguration.getInstance().setExposedHeaders( Arrays.asList( exposedHeadersProperty.split( "," ) ) );
      logDebug( "Setting Allow Domains to [ " + exposedHeadersProperty + " ]" );
    }
    if ( !StringUtils.isEmpty( allowedHeadersProperty ) ) {
      CORSConfiguration.getInstance().setAllowedHeaders( Arrays.asList( allowedHeadersProperty.split( "," ) ) );
      logDebug( "Setting Allow Headers to [ " + allowedHeadersProperty + " ]" );
    }
    if ( !StringUtils.isEmpty( maxAgeProperty ) ) {
      try {
        CORSConfiguration.getInstance().setMaxAge( Integer.parseInt( maxAgeProperty ) );
        logDebug( "Setting Max Age to [ " + maxAgeProperty + " ]" );
      } catch ( NumberFormatException nfe ) {
        CORSConfiguration.getInstance().setMaxAge( -1 );
      }
    }
    CORSConfiguration.getInstance().setSupportsCredentials( Boolean.parseBoolean( supportsCredentialsProperty ) );
    logDebug( "Setting Support Credentials to [ " + supportsCredentialsProperty + " ]" );
    CORSConfiguration.getInstance().setAllowAnyHeader( Boolean.parseBoolean( allowAnyHeaderProperty ) );
    logDebug( "Setting Allow Any Header to [ " + allowAnyHeaderProperty + " ]" );
    logDebug( "Finished initializing the CORS Configuration" );
  }

  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
      throws IOException, ServletException {
    HttpServletRequest httpRequest = (HttpServletRequest) request;
    HttpServletResponse httpResponse = (HttpServletResponse) response;

    CORSConfiguration.getInstance().applyCORSHeaders( httpRequest, httpResponse );

    chain.doFilter( request, response );
  }

  @Override public void destroy() {

  }

  public String getAllowSubDomainsProperty() {
    return allowSubDomainsProperty;
  }

  public void setAllowSubDomainsProperty( String allowSubDomainsProperty ) {
    this.allowSubDomainsProperty = allowSubDomainsProperty;
  }

  public String getAllowedDomainsProperty() {
    return allowedDomainsProperty;
  }

  public void setAllowedDomainsProperty( String allowedDomainsProperty ) {
    this.allowedDomainsProperty = allowedDomainsProperty;
  }


  public String getAllowAnyDomainProperty() {
    return allowAnyDomainProperty;
  }

  public void setAllowAnyDomainProperty( String allowAnyDomainProperty ) {
    this.allowAnyDomainProperty = allowAnyDomainProperty;
  }

  public String getAllowedMethodsProperty() {
    return allowedMethodsProperty;
  }

  public void setAllowedMethodsProperty( String allowedMethodsProperty ) {
    this.allowedMethodsProperty = allowedMethodsProperty;
  }

  public String getExposedHeadersProperty() {
    return exposedHeadersProperty;
  }

  public void setExposedHeadersProperty( String exposedHeadersProperty ) {
    this.exposedHeadersProperty = exposedHeadersProperty;
  }

  public String getAllowedHeadersProperty() {
    return allowedHeadersProperty;
  }

  public void setAllowedHeadersProperty( String allowedHeadersProperty ) {
    this.allowedHeadersProperty = allowedHeadersProperty;
  }

  public String getSupportsCredentialsProperty() {
    return supportsCredentialsProperty;
  }

  public void setSupportsCredentialsProperty( String supportsCredentialsProperty ) {
    this.supportsCredentialsProperty = supportsCredentialsProperty;
  }

  public String getMaxAgeProperty() {
    return maxAgeProperty;
  }

  public void setMaxAgeProperty( String maxAgeProperty ) {
    this.maxAgeProperty = maxAgeProperty;
  }

  public String getAllowAnyHeaderProperty() {
    return allowAnyHeaderProperty;
  }

  public void setAllowAnyHeaderProperty( String allowAnyHeaderProperty ) {
    this.allowAnyHeaderProperty = allowAnyHeaderProperty;
  }

  public void afterPropertiesSet() {
    Assert.hasLength( allowSubDomainsProperty, Messages.getInstance()
        .getString( "PentahoCORSEnabledFilter.ERROR_0001_ALLOW_SUBDOMAIN_NOT_SPECIFIED" ) ); //$NON-NLS-1$
    Assert.hasLength( allowedDomainsProperty, Messages.getInstance()
        .getString( "PentahoCORSEnabledFilter.ERROR_0002_ALLOWED_DOMAINS_NOT_SPECIFIED" ) ); //$NON-NLS-1$
    Assert.hasLength( allowedMethodsProperty, Messages.getInstance()
        .getString( "PentahoCORSEnabledFilter.ERROR_0003_ALLOWED_METHOD_NOT_SPECIFIED" ) ); //$NON-NLS-1$
    Assert.hasLength( supportsCredentialsProperty, Messages.getInstance()
        .getString( "PentahoCORSEnabledFilter.ERROR_0004_SUPPORTS_CREDENTIALS_NOT_SPECIFIED" ) ); //$NON-NLS-1$
    Assert.hasLength( allowAnyHeaderProperty, Messages.getInstance()
        .getString( "PentahoCORSEnabledFilter.ERROR_0005_ALLOW_ANY_HEADER_NOT_SPECIFIED" ) ); //$NON-NLS-1$
    initialize();
  }

  private String[] parseDomains( String domains ) {
    String cleansedDomains = domains.trim();
    if ( cleansedDomains.isEmpty() ) {
      return new String[0];
    }
    return cleansedDomains.split( "\\s*,\\s*|\\s+" );
  }

  private void logDebug( String message ) {
    //logger.error( message );
    if ( logger.isDebugEnabled() ) {
      logger.debug( message );
    }
  }
}


