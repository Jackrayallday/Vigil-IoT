import unittest
from unittest.mock import Mock, MagicMock, patch
from zeroconf import BadTypeInNameException
from discovery.mdns_listener import MDNSListener

class TestMDNSListener(unittest.TestCase):
    def setUp(self):
        self.mock_store = Mock()
        self.listener = MDNSListener(self.mock_store, debug=False)
        self.listener.zeroconf = Mock()

    def test_add_service_valid_instance_with_ip(self):
        mock_info = Mock()
        mock_info.addresses = [b'\xc0\xa8\x01\x01']  # 192.168.1.1
        self.listener.zeroconf.get_service_info.return_value = mock_info

        self.listener.add_service(Mock(), "_http._tcp.local.", "MyDevice._http._tcp.local.")

        self.mock_store.add.assert_called_once_with(
            "192.168.1.1",
            {"source": "mDNS", "service": "MyDevice._http._tcp.local."}
        )

    def test_add_service_invalid_instance_no_dot(self):
        self.listener.add_service(Mock(), "_http._tcp.local.", "_http._tcp.local.")
        self.mock_store.add.assert_not_called()

    def test_add_service_bad_type_exception(self):
        self.listener.zeroconf.get_service_info.side_effect = BadTypeInNameException()
        
        self.listener.add_service(Mock(), "_http._tcp.local.", "Invalid._http._tcp.local.")
        
        self.mock_store.add.assert_not_called()

    def test_add_service_no_addresses(self):
        mock_info = Mock()
        mock_info.addresses = []
        self.listener.zeroconf.get_service_info.return_value = mock_info

        self.listener.add_service(Mock(), "_http._tcp.local.", "MyDevice._http._tcp.local.")

        self.mock_store.add.assert_not_called()

    def test_remove_service_does_not_throw(self):
        # remove_service() is a stub, but should not throw any exception
        try:
            self.listener.remove_service(Mock(), "_http._tcp.local.", "MyDevice._http._tcp.local.")
        except:
            self.fail("remove_service() should not raise any exception")

if __name__ == "__main__":
    unittest.main()
