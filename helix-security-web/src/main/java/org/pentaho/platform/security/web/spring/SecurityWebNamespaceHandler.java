/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.spring;

import org.springframework.beans.factory.xml.NamespaceHandlerSupport;

/**
 * Spring XML namespace handler for {@code http://www.pentaho.com/schema/security-web} (prefix
 * {@code hsw:}), the owned replacement for the proprietary {@code swm:} namespace.
 * <p>
 * Supported elements: {@code regex-request-matcher}, {@code or-request-matcher},
 * {@code all-request-matcher}, {@code none-request-matcher}.
 */
public class SecurityWebNamespaceHandler extends NamespaceHandlerSupport {

  @Override
  public void init() {
    registerBeanDefinitionParser( "regex-request-matcher", new RegexRequestMatcherBeanDefinitionParser() );
    registerBeanDefinitionParser( "or-request-matcher", new OrRequestMatcherBeanDefinitionParser() );
    registerBeanDefinitionParser( "all-request-matcher", new ConstantRequestMatcherBeanDefinitionParser( true ) );
    registerBeanDefinitionParser( "none-request-matcher", new ConstantRequestMatcherBeanDefinitionParser( false ) );
  }
}
