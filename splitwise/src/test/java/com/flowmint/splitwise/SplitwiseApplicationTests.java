package com.flowmint.splitwise;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;

@SpringBootTest
class SplitwiseApplicationTests {

	@MockitoBean
	private JwtDecoder jwtDecoder;

	@Test
	void contextLoads() {
	}

}
