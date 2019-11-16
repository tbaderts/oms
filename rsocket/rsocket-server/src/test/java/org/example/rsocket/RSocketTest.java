package org.example.rsocket;

import org.junit.jupiter.api.Test;
import org.reactivestreams.Subscriber;
import org.reactivestreams.Subscription;
import org.springframework.http.MediaType;
import org.springframework.messaging.rsocket.MetadataExtractor;

import io.rsocket.Payload;
import io.rsocket.RSocket;
import io.rsocket.RSocketFactory;
import io.rsocket.frame.decoder.PayloadDecoder;
import io.rsocket.transport.netty.client.TcpClientTransport;
import io.rsocket.util.DefaultPayload;

public class RSocketTest {

	@Test
	public void testRSocketClient() {
		final RSocket rSocket = connect();
		requestStream(rSocket);
	}

	private RSocket connect() {
		return RSocketFactory.connect().dataMimeType(MediaType.APPLICATION_JSON_VALUE)
				.mimeType(MetadataExtractor.ROUTE_KEY, "orders")
				.frameDecoder(PayloadDecoder.ZERO_COPY).transport(TcpClientTransport.create(7000)).start()
				.block();
	}

	private void requestStream(RSocket rSocket) {
		rSocket.requestStream(DefaultPayload.create("")).subscribe(new TestSubscriber());
	}
	
	private static class TestSubscriber implements Subscriber<Payload> {

		@Override
		public void onSubscribe(Subscription s) {
			System.out.println("Starting subscription: " + s);
		}

		@Override
		public void onNext(Payload t) {
			System.out.println("Received data: " + t.toString());
		}

		@Override
		public void onError(Throwable t) {
			System.err.println("Error: " + t.getMessage());
		}

		@Override
		public void onComplete() {
			
		}
		
	}

}
