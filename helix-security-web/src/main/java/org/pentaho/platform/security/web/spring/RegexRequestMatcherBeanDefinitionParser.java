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

import org.pentaho.platform.security.web.model.matcher.RegexRequestMatcher;
import org.springframework.beans.factory.support.BeanDefinitionBuilder;
import org.springframework.beans.factory.xml.AbstractSingleBeanDefinitionParser;
import org.springframework.util.StringUtils;
import org.w3c.dom.Element;

import java.util.Arrays;
import java.util.List;

/**
 * Parses {@code <hsw:regex-request-matcher pattern="..." methods="GET POST" insensitive="true"/>} into a
 * {@link RegexRequestMatcher} bean.
 */
public class RegexRequestMatcherBeanDefinitionParser extends AbstractSingleBeanDefinitionParser {

  @Override
  protected Class<?> getBeanClass( Element element ) {
    return RegexRequestMatcher.class;
  }

  @Override
  protected boolean shouldGenerateIdAsFallback() {
    return true;
  }

  @Override
  protected void doParse( Element element, BeanDefinitionBuilder builder ) {
    builder.addConstructorArgValue( element.getAttribute( "pattern" ) );

    String methods = element.getAttribute( "methods" );
    if ( StringUtils.hasText( methods ) ) {
      List<String> methodList = Arrays.asList( StringUtils.tokenizeToStringArray( methods, " ,;\t\n" ) );
      builder.addConstructorArgValue( methodList );
    } else {
      builder.addConstructorArgValue( null );
    }

    String insensitive = element.getAttribute( "insensitive" );
    builder.addConstructorArgValue( StringUtils.hasText( insensitive ) && Boolean.parseBoolean( insensitive ) );
  }
}
